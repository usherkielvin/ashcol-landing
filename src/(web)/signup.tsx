/**
 * Web Signup Page — split-screen layout.
 * Left: dark brand panel. Right: multi-step signup form (no navigation between steps).
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
import { useAuth } from '../../src/contexts/AuthContext'
import { LUZON_REGIONS } from '../../src/data/luzon-regions'
import { authService } from '../../src/services/api'
import { consumePendingGoogleSignup } from '../../src/utils/signup-state'
import {
    validateCity,
    validateEmail,
    validateName,
    validatePasswordConfirm,
    validatePasswordSignUp,
    validatePhone,
    validateRegion,
} from '../../src/utils/validation'

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type SignupStep =
  | 'email'
  | 'verify'
  | 'details'
  | 'password'
  | 'google-details'
  | 'google-password'

const FEATURES = [
  { icon: 'check-circle' as const, text: 'Real-time ticket tracking' },
  { icon: 'check-circle' as const, text: 'Role-based access control' },
  { icon: 'check-circle' as const, text: 'Multi-branch management' },
  { icon: 'check-circle' as const, text: 'Instant service assignment' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WebSignupPage(): React.ReactElement {
  const { register, registerGoogle } = useAuth()
  const router = useRouter()
  const params = useLocalSearchParams<{ step?: string; googleSignup?: string }>()

  const [step, setStep] = useState<SignupStep>('email')
  const [email, setEmail] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [region, setRegion] = useState('')
  const [city, setCity] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [googleIdToken, setGoogleIdToken] = useState('')
  const [googleAccessToken, setGoogleAccessToken] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [showRegionList, setShowRegionList] = useState(false)
  const [showCityList, setShowCityList] = useState(false)

  useEffect(() => {
    if (params.googleSignup === '1') {
      const pending = consumePendingGoogleSignup()
      if (pending) {
        setEmail(pending.email)
        setName(pending.name)
        setGoogleIdToken(pending.idToken)
        setGoogleAccessToken(pending.accessToken)
        setStep('google-details')
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedRegionData = LUZON_REGIONS.find((r) => r.value === region)
  const cityOptions = selectedRegionData?.cities ?? []

  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => { const next = { ...prev }; delete next[key]; return next })
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleBack = () => {
    setError(null)
    setFieldErrors({})
    if (step === 'email') router.push('/create-account' as any)
    else if (step === 'verify') setStep('email')
    else if (step === 'details') setStep('verify')
    else if (step === 'password') setStep('details')
    else if (step === 'google-details') router.push('/create-account' as any)
    else if (step === 'google-password') setStep('google-details')
  }

  const handleSendCode = async () => {
    const res = validateEmail(email)
    if (!res.valid) { setFieldErrors({ email: res.message! }); return }
    setError(null)
    setFieldErrors({})
    try {
      setLoading(true)
      await authService.sendSignupCode(email.trim())
      setVerificationCode('')
      setStep('verify')
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to send code.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyAndContinue = () => {
    const code = verificationCode.trim()
    if (!code || code.length !== 6) {
      setFieldErrors({ verificationCode: 'Enter the 6-digit code from your email' })
      return
    }
    setError(null)
    setFieldErrors({})
    setStep('details')
  }

  const handleDetailsContinue = () => {
    const newErrors: Record<string, string> = {}
    const nameRes = validateName(name)
    const phoneRes = validatePhone(phone)
    const regionRes = validateRegion(region)
    const cityRes = validateCity(city)
    if (!nameRes.valid) newErrors.name = nameRes.message!
    if (!phoneRes.valid) newErrors.phone = phoneRes.message!
    if (!regionRes.valid) newErrors.region = regionRes.message!
    if (!cityRes.valid) newErrors.city = cityRes.message!
    setFieldErrors(newErrors)
    if (Object.keys(newErrors).length > 0) return
    setError(null)
    setStep('password')
  }

  const handleCreateAccount = async () => {
    const newErrors: Record<string, string> = {}
    const passRes = validatePasswordSignUp(password)
    const confirmRes = validatePasswordConfirm(password, confirmPassword)
    if (!passRes.valid) newErrors.password = passRes.message!
    if (!confirmRes.valid) newErrors.confirmPassword = confirmRes.message!
    setFieldErrors(newErrors)
    if (Object.keys(newErrors).length > 0) return
    try {
      setLoading(true)
      setError(null)
      await register({
        name: name.trim(),
        email: email.trim(),
        phone: phone.replace(/\D/g, ''),
        password,
        password_confirmation: confirmPassword,
        role: 'customer',
        region: region.trim(),
        city: city.trim(),
        ...(verificationCode ? { verification_code: verificationCode.trim() } : {}),
      })
      router.replace('/(web)/dashboard' as any)
    } catch (err: any) {
      const data = err?.response?.data
      const msg = data?.message || err?.message || 'Unable to create account. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleDetailsContinue = () => {
    const newErrors: Record<string, string> = {}
    const nameRes = validateName(name)
    const phoneRes = validatePhone(phone)
    const regionRes = validateRegion(region)
    const cityRes = validateCity(city)
    if (!nameRes.valid) newErrors.name = nameRes.message!
    if (!phoneRes.valid) newErrors.phone = phoneRes.message!
    if (!regionRes.valid) newErrors.region = regionRes.message!
    if (!cityRes.valid) newErrors.city = cityRes.message!
    setFieldErrors(newErrors)
    if (Object.keys(newErrors).length > 0) return
    setError(null)
    setStep('google-password')
  }

  const handleGoogleCreateAccount = async () => {
    const newErrors: Record<string, string> = {}
    const passRes = validatePasswordSignUp(password)
    const confirmRes = validatePasswordConfirm(password, confirmPassword)
    if (!passRes.valid) newErrors.password = passRes.message!
    if (!confirmRes.valid) newErrors.confirmPassword = confirmRes.message!
    setFieldErrors(newErrors)
    if (Object.keys(newErrors).length > 0) return
    try {
      setLoading(true)
      setError(null)
      await registerGoogle({
        id_token: googleIdToken,
        access_token: googleAccessToken || undefined,
        name: name.trim(),
        email: email.trim(),
        phone: phone.replace(/\D/g, ''),
        region: region.trim(),
        city: city.trim(),
        password,
        password_confirmation: confirmPassword,
      })
      router.replace('/(web)/dashboard' as any)
    } catch (err: any) {
      const data = err?.response?.data
      let msg = data?.message
      if (!msg && Array.isArray(data?.errors)) {
        const first = data.errors[0]
        msg = typeof first === 'string' ? first : first?.message ?? first?.defaultMessage
      }
      if (!msg) msg = err?.message
      if (!msg || msg.startsWith('Request failed')) msg = 'Unable to create account. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // ── Metadata ──────────────────────────────────────────────────────────────

  const isGoogleFlow = step === 'google-details' || step === 'google-password'
  const stepTitles: Record<SignupStep, string> = {
    email: 'Create your account',
    verify: 'Verify your email',
    details: 'Your profile details',
    password: 'Set your password',
    'google-details': 'Complete your profile',
    'google-password': 'Set your password',
  }
  const stepSubtitles: Record<SignupStep, string> = {
    email: "Enter your email and we'll send a verification code.",
    verify: 'Enter the 6-digit code sent to your email.',
    details: 'Tell us a bit about yourself.',
    password: 'Choose a secure password (at least 8 characters).',
    'google-details': 'A few more details to finish your account.',
    'google-password': 'Choose a secure password (at least 8 characters).',
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.page}>

      {/* ── Left brand panel ── */}
      <View style={styles.brandPanel}>
        <View style={styles.brandContent}>
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
        <Text style={styles.brandTag}>Ashcol Service Hub © 2025</Text>
      </View>

      {/* ── Right form panel ── */}
      <ScrollView
        style={styles.formPanel}
        contentContainerStyle={styles.formContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.formCard}>

          {/* Back */}
          <Pressable onPress={handleBack} disabled={loading} style={styles.backBtn}>
            <Feather name="arrow-left" size={14} color="#64748B" />
            <Text style={styles.backText}>
              {(step === 'email' || step === 'google-details') ? 'Back to options' : 'Back'}
            </Text>
          </Pressable>

          {/* Heading */}
          <Text style={styles.formTitle}>{stepTitles[step]}</Text>
          <Text style={styles.formSub}>{stepSubtitles[step]}</Text>

          {/* Error banner */}
          {error && (
            <View style={styles.errorBanner}>
              <Feather name="alert-circle" size={14} color="#991B1B" />
              <Text style={styles.errorBannerText}>{error}</Text>
            </View>
          )}

          {/* ── Step: email ── */}
          {step === 'email' && (
            <>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Email address</Text>
                <View style={[styles.inputWrapper, fieldErrors.email ? styles.inputWrapperError : null]}>
                  <Feather name="mail" size={15} color="#94A3B8" />
                  <TextInput
                    style={styles.input}
                    placeholder="you@example.com"
                    placeholderTextColor="#CBD5E1"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={(t) => { setEmail(t); clearFieldError('email') }}
                    editable={!loading}
                    accessibilityLabel="Email address"
                  />
                </View>
                {fieldErrors.email ? <Text style={styles.fieldErrorText}>{fieldErrors.email}</Text> : null}
              </View>
              <Pressable
                onPress={handleSendCode}
                disabled={loading}
                style={({ pressed }) => [styles.submitBtn, (loading || pressed) && styles.submitBtnPressed]}
                accessibilityRole="button"
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <View style={styles.submitBtnInner}>
                      <Text style={styles.submitBtnText}>Send verification code</Text>
                      <Feather name="arrow-right" size={16} color="#fff" />
                    </View>
                }
              </Pressable>
            </>
          )}

          {/* ── Step: verify ── */}
          {step === 'verify' && (
            <>
              <Text style={styles.emailHint}>
                Code sent to <Text style={styles.emailHintBold}>{email}</Text>
              </Text>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Verification code</Text>
                <View style={[styles.inputWrapper, fieldErrors.verificationCode ? styles.inputWrapperError : null]}>
                  <Feather name="hash" size={15} color="#94A3B8" />
                  <TextInput
                    style={styles.input}
                    placeholder="6-digit code"
                    placeholderTextColor="#CBD5E1"
                    keyboardType="number-pad"
                    maxLength={6}
                    value={verificationCode}
                    onChangeText={(t) => { setVerificationCode(t.replace(/\D/g, '')); clearFieldError('verificationCode') }}
                    editable={!loading}
                    accessibilityLabel="Verification code"
                  />
                </View>
                {fieldErrors.verificationCode
                  ? <Text style={styles.fieldErrorText}>{fieldErrors.verificationCode}</Text>
                  : null}
              </View>
              <Pressable onPress={handleSendCode} disabled={loading} style={styles.resendBtn}>
                <Text style={styles.resendText}>Resend code</Text>
              </Pressable>
              <Pressable
                onPress={handleVerifyAndContinue}
                disabled={loading}
                style={({ pressed }) => [styles.submitBtn, (loading || pressed) && styles.submitBtnPressed]}
                accessibilityRole="button"
              >
                <View style={styles.submitBtnInner}>
                  <Text style={styles.submitBtnText}>Continue</Text>
                  <Feather name="arrow-right" size={16} color="#fff" />
                </View>
              </Pressable>
            </>
          )}

          {/* ── Step: details / google-details ── */}
          {(step === 'details' || step === 'google-details') && (
            <>
              {isGoogleFlow && (
                <View style={styles.googleBadge}>
                  <Image source={{ uri: 'https://www.google.com/favicon.ico' }} style={styles.googleBadgeIcon} />
                  <Text style={styles.googleBadgeText}>Signed in with Google · {email}</Text>
                </View>
              )}

              {/* Name */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Full name</Text>
                <View style={[styles.inputWrapper, fieldErrors.name ? styles.inputWrapperError : null]}>
                  <Feather name="user" size={15} color="#94A3B8" />
                  <TextInput
                    style={styles.input}
                    placeholder="John Doe"
                    placeholderTextColor="#CBD5E1"
                    value={name}
                    onChangeText={(t) => { setName(t.replace(/\d/g, '')); clearFieldError('name') }}
                    editable={!loading}
                    accessibilityLabel="Full name"
                  />
                </View>
                {fieldErrors.name ? <Text style={styles.fieldErrorText}>{fieldErrors.name}</Text> : null}
              </View>

              {/* Phone */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Phone number</Text>
                <View style={[styles.inputWrapper, fieldErrors.phone ? styles.inputWrapperError : null]}>
                  <Feather name="phone" size={15} color="#94A3B8" />
                  <TextInput
                    style={styles.input}
                    placeholder="09123456789"
                    placeholderTextColor="#CBD5E1"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={(t) => { setPhone(t.replace(/[a-zA-Z]/g, '')); clearFieldError('phone') }}
                    editable={!loading}
                    accessibilityLabel="Phone number"
                  />
                </View>
                {fieldErrors.phone ? <Text style={styles.fieldErrorText}>{fieldErrors.phone}</Text> : null}
              </View>

              {/* Region */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Region</Text>
                <Pressable
                  style={[styles.inputWrapper, fieldErrors.region ? styles.inputWrapperError : null]}
                  onPress={() => { setShowRegionList((v) => !v); setShowCityList(false) }}
                >
                  <Feather name="map-pin" size={15} color="#94A3B8" />
                  <Text style={[styles.dropdownText, !region && styles.placeholderText]}>
                    {region ? LUZON_REGIONS.find((r) => r.value === region)?.label ?? region : 'Select region'}
                  </Text>
                  <Feather name={showRegionList ? 'chevron-up' : 'chevron-down'} size={14} color="#94A3B8" />
                </Pressable>
                {fieldErrors.region ? <Text style={styles.fieldErrorText}>{fieldErrors.region}</Text> : null}
                {showRegionList && (
                  <ScrollView style={styles.dropdownList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {LUZON_REGIONS.map((r) => (
                      <Pressable
                        key={r.value}
                        style={({ pressed }) => [styles.dropdownItem, pressed && styles.dropdownItemPressed]}
                        onPress={() => {
                          setRegion(r.value)
                          setCity('')
                          setShowRegionList(false)
                          clearFieldError('region')
                          clearFieldError('city')
                        }}
                      >
                        <Text style={styles.dropdownItemText}>{r.label}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>

              {/* City */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>City</Text>
                <Pressable
                  style={[
                    styles.inputWrapper,
                    fieldErrors.city ? styles.inputWrapperError : null,
                    !region && styles.inputWrapperDisabled,
                  ]}
                  onPress={() => { if (region) { setShowCityList((v) => !v); setShowRegionList(false) } }}
                >
                  <Feather name="map" size={15} color="#94A3B8" />
                  <Text style={[styles.dropdownText, !city && styles.placeholderText]}>
                    {city || (region ? 'Select city' : 'Select a region first')}
                  </Text>
                  {region && <Feather name={showCityList ? 'chevron-up' : 'chevron-down'} size={14} color="#94A3B8" />}
                </Pressable>
                {fieldErrors.city ? <Text style={styles.fieldErrorText}>{fieldErrors.city}</Text> : null}
                {showCityList && cityOptions.length > 0 && (
                  <ScrollView style={styles.dropdownList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {cityOptions.map((c) => (
                      <Pressable
                        key={c}
                        style={({ pressed }) => [styles.dropdownItem, pressed && styles.dropdownItemPressed]}
                        onPress={() => {
                          setCity(c)
                          setShowCityList(false)
                          clearFieldError('city')
                        }}
                      >
                        <Text style={styles.dropdownItemText}>{c}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>

              <Pressable
                onPress={step === 'google-details' ? handleGoogleDetailsContinue : handleDetailsContinue}
                disabled={loading}
                style={({ pressed }) => [styles.submitBtn, (loading || pressed) && styles.submitBtnPressed]}
                accessibilityRole="button"
              >
                <View style={styles.submitBtnInner}>
                  <Text style={styles.submitBtnText}>Continue</Text>
                  <Feather name="arrow-right" size={16} color="#fff" />
                </View>
              </Pressable>
            </>
          )}

          {/* ── Step: password / google-password ── */}
          {(step === 'password' || step === 'google-password') && (
            <>
              {/* Password */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Password</Text>
                <View style={[styles.inputWrapper, fieldErrors.password ? styles.inputWrapperError : null]}>
                  <Feather name="lock" size={15} color="#94A3B8" />
                  <TextInput
                    style={styles.input}
                    placeholder="At least 8 characters"
                    placeholderTextColor="#CBD5E1"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={(t) => { setPassword(t); clearFieldError('password'); clearFieldError('confirmPassword') }}
                    editable={!loading}
                    accessibilityLabel="Password"
                  />
                  <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8} accessibilityRole="button">
                    <Feather name={showPassword ? 'eye-off' : 'eye'} size={15} color="#94A3B8" />
                  </Pressable>
                </View>
                {fieldErrors.password ? <Text style={styles.fieldErrorText}>{fieldErrors.password}</Text> : null}
              </View>

              {/* Confirm */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Confirm password</Text>
                <View style={[styles.inputWrapper, fieldErrors.confirmPassword ? styles.inputWrapperError : null]}>
                  <Feather name="lock" size={15} color="#94A3B8" />
                  <TextInput
                    style={styles.input}
                    placeholder="Re-enter password"
                    placeholderTextColor="#CBD5E1"
                    secureTextEntry={!showPassword}
                    value={confirmPassword}
                    onChangeText={(t) => { setConfirmPassword(t); clearFieldError('confirmPassword') }}
                    editable={!loading}
                    accessibilityLabel="Confirm password"
                  />
                </View>
                {fieldErrors.confirmPassword
                  ? <Text style={styles.fieldErrorText}>{fieldErrors.confirmPassword}</Text>
                  : null}
              </View>

              <Pressable
                onPress={step === 'google-password' ? handleGoogleCreateAccount : handleCreateAccount}
                disabled={loading}
                style={({ pressed }) => [styles.submitBtn, (loading || pressed) && styles.submitBtnPressed]}
                accessibilityRole="button"
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <View style={styles.submitBtnInner}>
                      <Text style={styles.submitBtnText}>Create account</Text>
                      <Feather name="check" size={16} color="#fff" />
                    </View>
                }
              </Pressable>
            </>
          )}

          {/* Footer */}
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Pressable onPress={() => router.replace('/(web)/login' as any)} disabled={loading}>
              <Text style={styles.footerLink}>Sign in</Text>
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

  // ── Brand panel ──
  brandPanel: {
    width: '50%' as any,
    backgroundColor: '#0B1120',
    paddingVertical: 48,
    paddingHorizontal: 40,
    flexDirection: 'column' as const,
    justifyContent: 'space-between' as const,
    position: 'sticky' as any,
    top: 0,
    height: '100vh' as any,
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
  logoImage: { width: 42, height: 42 },
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
  featureList: { gap: 14 },
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
  formContent: {
    flexGrow: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 40,
    paddingHorizontal: 32,
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

  // ── Back button ──
  backBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginBottom: 20,
    alignSelf: 'flex-start' as const,
  },
  backText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },

  // ── Headings ──
  formTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  formSub: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 24,
    lineHeight: 20,
  },

  // ── Error banner ──
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#991B1B',
    fontWeight: '500',
  },

  // ── Field ──
  fieldGroup: { marginBottom: 16 },
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

  // ── Input ──
  inputWrapper: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    height: 46,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 13,
    backgroundColor: '#FAFBFC',
    gap: 10,
  },
  inputWrapperError: { borderColor: '#EF4444' },
  inputWrapperDisabled: { opacity: 0.45 },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    outlineStyle: 'none' as any,
  },

  // ── Dropdown ──
  dropdownText: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
  },
  placeholderText: { color: '#CBD5E1' },
  dropdownList: {
    marginTop: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    maxHeight: 176,
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)' as any,
  },
  dropdownItem: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  dropdownItemPressed: { backgroundColor: '#F0FDF4' },
  dropdownItemText: {
    fontSize: 14,
    color: '#1E293B',
  },

  // ── Submit button ──
  submitBtn: {
    height: 50,
    backgroundColor: '#10B981',
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 8,
    boxShadow: '0 4px 12px rgba(16,185,129,0.3)' as any,
  },
  submitBtnPressed: { opacity: 0.85 },
  submitBtnInner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // ── Verify step ──
  emailHint: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
  },
  emailHintBold: {
    fontWeight: '700',
    color: '#0F172A',
  },
  resendBtn: {
    alignSelf: 'flex-end' as const,
    marginBottom: 8,
    marginTop: -8,
  },
  resendText: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '600',
  },

  // ── Google badge ──
  googleBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  googleBadgeIcon: { width: 14, height: 14 },
  googleBadgeText: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '500',
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
