/**
 * Web Portal Landing Page — Ashcol Airconditioning Corporation
 * "Keeping YOU Cool" since 2014
 */

import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React, { useState, useRef } from 'react'
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'

// ---------------------------------------------------------------------------
// Breakpoints
// ---------------------------------------------------------------------------

function useBreakpoint() {
  const { width } = useWindowDimensions()
  return {
    width,
    isMobile: width < 640,
    isTablet: width >= 640 && width < 1024,
    isDesktop: width >= 1024,
  }
}

// ---------------------------------------------------------------------------
// Company data
// ---------------------------------------------------------------------------

const SERVICES = [
  {
    icon: 'tool' as const,
    title: 'Installation',
    color: '#10B981',
    desc: 'Professional installation of new air conditioning systems for homes and businesses.',
    items: ['Residential AC Units', 'Commercial Systems', 'Ductless Mini-Splits', 'Heat Pumps'],
  },
  {
    icon: 'settings' as const,
    title: 'Repair & Maintenance',
    color: '#3B82F6',
    desc: 'Expert repair and preventive maintenance to keep your system running efficiently.',
    items: ['Emergency Repairs', 'Preventive Maintenance', 'System Diagnostics', 'Performance Optimisation'],
  },
  {
    icon: 'trending-up' as const,
    title: 'System Upgrades',
    color: '#8B5CF6',
    desc: 'Upgrade your existing system for better efficiency, comfort, and energy savings.',
    items: ['Energy-Efficient Upgrades', 'Smart Thermostats', 'Air Quality Improvements', 'Zoning Systems'],
  },
]

const CONTACTS = [
  { icon: 'phone' as const,     label: 'Customer Hotline',         value: '+63 (2) 77291293',  href: 'tel:+63277291293' },
  { icon: 'tool' as const,      label: 'Service / Technical',      value: '+63 (2) 77541418',  href: 'tel:+63277541418' },
  { icon: 'smartphone' as const,label: 'Mobile (Globe)',            value: '+63 (917) 7143810', href: 'tel:+639177143810' },
  { icon: 'headphones' as const, label: 'Express Assist',          value: '+63 (2) 79590289',  href: 'tel:+63279590289' },
  { icon: 'mail' as const,      label: 'Email',                    value: 'headoffice@ashcol.com.ph', href: 'mailto:headoffice@ashcol.com.ph' },
]

const STATS = [
  { value: '2014',      label: 'Est. Year',         icon: 'award' as const },
  { value: '7 days',    label: 'Open Mon–Sun',       icon: 'calendar' as const },
  { value: '8am–7pm',   label: 'Business Hours',     icon: 'clock' as const },
  { value: '10yr+',     label: 'In the Industry',    icon: 'star' as const },
]

// ---------------------------------------------------------------------------
// Colour palette
// ---------------------------------------------------------------------------

const BG      = '#060B18'
const SURFACE = '#0C1426'
const CARD    = '#0F1A2E'
const CARD2   = '#111E33'
const BORDER  = '#1E2D48'
const BORDER2 = '#243452'
const GREEN   = '#10B981'
const GREENLO = 'rgba(16,185,129,0.12)'
const TEXT1   = '#F0F6FF'
const TEXT2   = '#7A95B8'
const TEXT3   = '#3A5070'

// ---------------------------------------------------------------------------
// Navbar
// ---------------------------------------------------------------------------

function NavBar({
  hPad,
  isMobile,
  onLogin,
  onSignup,
  onScrollTo,
}: {
  hPad: number
  isMobile: boolean
  onLogin: () => void
  onSignup: () => void
  onScrollTo: (section: string) => void
}) {
  return (
    <View style={[styles.nav, { paddingHorizontal: hPad }]}>
      <Pressable onPress={() => onScrollTo('hero')} style={styles.navBrand}>
        <Image
          source={require('../../assets/images/ash-oval-transparent.png')}
          style={styles.navLogoImg}
          resizeMode="contain"
        />
        <View>
          <Text style={styles.navBrandText}>Ashcol</Text>
          {!isMobile && <Text style={styles.navBrandSub}>Airconditioning Corp.</Text>}
        </View>
      </Pressable>

      {!isMobile && (
        <View style={styles.navLinks}>
          <Pressable onPress={() => onScrollTo('services')}>
            <Text style={styles.navLink}>Services</Text>
          </Pressable>
          <Pressable onPress={() => onScrollTo('showcase')}>
            <Text style={styles.navLink}>Showcase</Text>
          </Pressable>
          <Pressable onPress={() => onScrollTo('about')}>
            <Text style={styles.navLink}>About Us</Text>
          </Pressable>
          <Pressable onPress={onLogin}>
            <Text style={[styles.navLink, { color: GREEN }]}>Staff Portal</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.navActions}>
        <Pressable
          onPress={onLogin}
          style={({ pressed }) => [styles.navSignIn, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.navSignInText}>Sign In</Text>
        </Pressable>
        {!isMobile && (
          <Pressable
            onPress={onSignup}
            style={({ pressed }) => [styles.navCta, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.navCtaText}>Create Account</Text>
            <Feather name="arrow-right" size={13} color="#fff" />
          </Pressable>
        )}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function WebLandingPage(): React.ReactElement {
  const router   = useRouter()
  const scrollRef = useRef<ScrollView>(null)
  const [offsets, setOffsets] = useState<Record<string, number>>({})
  const [hoveredService, setHoveredService] = useState<number | null>(null)
  const { isMobile, isTablet, width } = useBreakpoint()

  const goLogin  = () => router.push('/(web)/login' as any)
  const goSignup = () => router.push('/create-account' as any)

  const hPad   = isMobile ? 20 : isTablet ? 44 : 88
  const h1Size = isMobile ? 34 : isTablet ? 48 : 62
  const h1Line = isMobile ? 42 : isTablet ? 60 : 72
  const h2Size = isMobile ? 24 : isTablet ? 32 : 38
  const secPad = isMobile ? 56 : 96
  const maxW   = Math.min(width, 1200)

  const sGap   = (2) * 20
  const sCardW = isMobile ? maxW - hPad * 2 : isTablet ? (maxW - hPad * 2 - 20) / 2 : (maxW - hPad * 2 - sGap) / 3

  const handleScrollTo = (section: string) => {
    const y = offsets[section]
    if (typeof y === 'number') {
      scrollRef.current?.scrollTo({ y, animated: true })
    }
  }

  const onLayout = (section: string) => (event: any) => {
    const { y } = event.nativeEvent.layout
    setOffsets(prev => ({ ...prev, [section]: y }))
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
    >
      {/* ── Navbar ─────────────────────────────────────── */}
      <NavBar
        hPad={hPad}
        isMobile={isMobile}
        onLogin={goLogin}
        onSignup={goSignup}
        onScrollTo={handleScrollTo}
      />

      {/* ── Hero ───────────────────────────────────────── */}
      <View
        onLayout={onLayout('hero')}
        style={[styles.hero, { paddingHorizontal: hPad, paddingVertical: isMobile ? 64 : 104 }]}
      >
        <View style={styles.glowOrbLeft} />
        <View style={styles.glowOrbRight} />

        {/* Badge */}
        <View style={styles.heroBadge}>
          <View style={styles.heroBadgePulse} />
          <Text style={styles.heroBadgeText}>Ashcol Airconditioning Corporation · Since 2014</Text>
        </View>

        {/* Tagline */}
        <Text style={[styles.heroH1, { fontSize: h1Size, lineHeight: h1Line }]}>
          Professional AC{'\n'}
          <Text style={styles.heroH1Accent}>Services you can trust.</Text>
        </Text>

        <Text style={styles.heroTagline}>"Keeping YOU Cool"</Text>

        <Text style={[styles.heroSub, { fontSize: isMobile ? 15 : 17 }]}>
          Your trusted partner for installation, repair, and maintenance of air conditioning systems — residential and commercial, throughout Metro Manila.
        </Text>

        {/* CTA */}
        <View style={[styles.heroBtns, isMobile && { flexDirection: 'column', width: '100%' }]}>
          <Pressable
            onPress={goSignup}
            style={({ pressed }) => [
              styles.heroBtnPrimary,
              isMobile && { width: '100%', justifyContent: 'center' },
              pressed && { opacity: 0.88 },
            ]}
          >
            <Text style={styles.heroBtnPrimaryText}>Request a Service</Text>
            <Feather name="arrow-right" size={16} color="#fff" />
          </Pressable>
          <Pressable
            onPress={goLogin}
            style={({ pressed }) => [
              styles.heroBtnSecondary,
              isMobile && { width: '100%', alignItems: 'center' },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Feather name="log-in" size={15} color={TEXT2} style={{ marginRight: 8 }} />
            <Text style={styles.heroBtnSecondaryText}>Staff Portal Login</Text>
          </Pressable>
        </View>

        {/* Quick contact strip */}
        <Pressable
          onPress={() => Linking.openURL('tel:+63277291293')}
          style={styles.heroContactStrip}
        >
          <View style={styles.heroContactIcon}>
            <Feather name="phone" size={14} color={GREEN} />
          </View>
          <Text style={styles.heroContactText}>
            Call us now: <Text style={styles.heroContactNum}>+63 (2) 77291293</Text>  ·  Mon–Sun, 8 AM–7 PM
          </Text>
        </Pressable>
      </View>

      {/* ── Stats ──────────────────────────────────────── */}
      <View style={[styles.statsBar, { paddingHorizontal: hPad }]}>
        {STATS.map((s, i) => (
          <View key={i} style={[styles.statCell, i < STATS.length - 1 && !isMobile && styles.statCellDivider]}>
            <View style={styles.statIconWrap}>
              <Feather name={s.icon} size={15} color={GREEN} />
            </View>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* ── Services ───────────────────────────────────── */}
      <View
        onLayout={onLayout('services')}
        style={[styles.section, { paddingHorizontal: hPad, paddingVertical: secPad }]}
      >
        <View style={styles.sectionHeader}>
          <View style={styles.eyebrowPill}>
            <Feather name="grid" size={11} color={GREEN} />
            <Text style={styles.eyebrowText}>OUR SERVICES</Text>
          </View>
          <Text style={[styles.sectionH2, { fontSize: h2Size }]}>
            Comprehensive AC solutions
          </Text>
          <Text style={styles.sectionSub}>
            From first-time installation to routine maintenance — we handle every aspect of your air conditioning needs.
          </Text>
        </View>

        <View style={[styles.servicesGrid, { maxWidth: maxW - hPad * 2 }]}>
          {SERVICES.map((svc, i) => (
            <Pressable
              key={i}
              // @ts-ignore
              onHoverIn={() => setHoveredService(i)}
              onHoverOut={() => setHoveredService(null)}
              style={[
                styles.serviceCard,
                { width: sCardW, borderColor: hoveredService === i ? svc.color + '55' : BORDER },
                hoveredService === i && styles.serviceCardHover,
              ]}
            >
              {/* Top accent */}
              <View style={[styles.serviceAccent, { backgroundColor: svc.color }]} />

              <View style={[styles.serviceIconWrap, { backgroundColor: svc.color + '20' }]}>
                <Feather name={svc.icon} size={22} color={svc.color} />
              </View>

              <Text style={styles.serviceTitle}>{svc.title}</Text>
              <Text style={styles.serviceDesc}>{svc.desc}</Text>

              <View style={styles.serviceDivider} />

              {svc.items.map((item, j) => (
                <View key={j} style={styles.serviceItem}>
                  <Feather name="check" size={13} color={svc.color} style={{ marginRight: 8 }} />
                  <Text style={styles.serviceItemText}>{item}</Text>
                </View>
              ))}
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── Showcase Section ───────────────────────────── */}
      <View
        onLayout={onLayout('showcase')}
        style={[styles.sectionAlt, { paddingHorizontal: hPad, paddingVertical: secPad }]}
      >
        <View style={styles.sectionHeader}>
          <View style={styles.eyebrowPill}>
            <Feather name="camera" size={11} color={GREEN} />
            <Text style={styles.eyebrowText}>OUR SHOWCASE</Text>
          </View>
          <Text style={[styles.sectionH3, { fontSize: h2Size }]}>Experience and Quality in Action</Text>
          <Text style={styles.sectionSub}>Take a look at our professional team and project sites.</Text>
        </View>

        <View style={[styles.showcaseGrid, { maxWidth: maxW - hPad * 2 }]}>
          <View style={styles.showcaseMain}>
             <View style={styles.imageContainer}>
                <Image
                  source={require('../../assets/images/ash.jpg')}
                  style={styles.showcaseLargeImg}
                  resizeMode="cover"
                />
                <View style={styles.imageOverlay}>
                   <Text style={styles.imageLabel}>Quality Assurance</Text>
                </View>
             </View>
          </View>
          <View style={styles.showcaseSide}>
             <View style={styles.imageContainerSmall}>
                <Image
                  source={require('../../assets/images/red.jpg')}
                  style={styles.showcaseSmallImg}
                  resizeMode="cover"
                />
                <View style={styles.imageOverlay}>
                   <Text style={styles.imageLabel}>Service Excellence</Text>
                </View>
             </View>
             <View style={styles.quoteBox}>
                <Feather name="message-square" size={24} color={GREEN} />
                <Text style={styles.quoteText}>"Providing the right comfort people deserve since 2014."</Text>
                <Text style={styles.quoteAuthor}>— Ashcol Management</Text>
             </View>
          </View>
        </View>
      </View>

      {/* ── About Us ───────────────────────────────────── */}
      <View
        onLayout={onLayout('about')}
        style={[styles.section, { paddingHorizontal: hPad, paddingVertical: secPad }]}
      >
        <View style={[
          styles.aboutGrid,
          { maxWidth: maxW - hPad * 2 },
          isMobile && { flexDirection: 'column' },
        ]}>
          {/* Text side */}
          <View style={[styles.aboutText, isMobile && { width: '100%' }]}>
            <View style={styles.eyebrowPill}>
              <Feather name="users" size={11} color={GREEN} />
              <Text style={styles.eyebrowText}>ABOUT US</Text>
            </View>
            <Text style={[styles.sectionH2, { fontSize: h2Size, textAlign: 'left', lineHeight: h2Size * 1.25 + 4, marginTop: 12 }]}>
              A family business{'\n'}built on trust.
            </Text>
            <Text style={styles.aboutPara}>
              <Text style={{ color: TEXT1, fontWeight: '600' }}>ASHCOL Airconditioning Services Corporation</Text> is a family-run business founded in 2014. The company name "ASHCOL" was formed from the names of the two lovely daughters — <Text style={{ color: GREEN }}>Ashanti</Text> and <Text style={{ color: GREEN }}>Coleene</Text>.
            </Text>
            <Text style={styles.aboutPara}>
              Located at Units 4D &amp; 4E, 4/F Genesis Building, 182-A J.P. Rizal Ext., Makati City — the team combines more than a decade of technical expertise with a deeply personal customer service philosophy.
            </Text>
            <Text style={styles.aboutPara}>
              Their tagline <Text style={{ color: GREEN, fontStyle: 'italic' }}>"Keeping YOU Cool"</Text> reflects their core belief: give people the comfort they deserve, and you will never have an unhappy customer.
            </Text>

            <View style={styles.aboutBadgeRow}>
              <View style={styles.aboutBadge}>
                <Feather name="map-pin" size={13} color={GREEN} />
                <Text style={styles.aboutBadgeText}>Makati City, Metro Manila</Text>
              </View>
              <View style={styles.aboutBadge}>
                <Feather name="calendar" size={13} color={GREEN} />
                <Text style={styles.aboutBadgeText}>Since 2014</Text>
              </View>
            </View>
          </View>

          {/* Info card side */}
          <View style={[styles.aboutCard, isMobile && { width: '100%' }]}>
            <View style={styles.aboutCardHeader}>
              <Feather name="headphones" size={18} color={GREEN} />
              <Text style={styles.aboutCardHeaderText}>Get in Touch</Text>
            </View>

            {CONTACTS.map((c, i) => (
              <Pressable
                key={i}
                onPress={() => Linking.openURL(c.href)}
                style={({ pressed }) => [styles.contactRow, pressed && { opacity: 0.7 }]}
              >
                <View style={styles.contactIconWrap}>
                  <Feather name={c.icon} size={14} color={GREEN} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactLabel}>{c.label}</Text>
                  <Text style={styles.contactValue}>{c.value}</Text>
                </View>
                <Feather name="external-link" size={12} color={TEXT3} />
              </Pressable>
            ))}

            <View style={styles.contactHours}>
              <Feather name="clock" size={14} color={GREEN} />
              <Text style={styles.contactHoursText}>
                Open 7 days a week · 8:00 AM – 7:00 PM (Including Holidays)
              </Text>
            </View>

            <Pressable
              onPress={() => Linking.openURL('https://www.facebook.com/AshcolCorp')}
              style={({ pressed }) => [styles.fbBtn, pressed && { opacity: 0.85 }]}
            >
              <Feather name="message-circle" size={15} color="#fff" />
              <Text style={styles.fbBtnText}>Message us on Facebook</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* ── CTA Banner ─────────────────────────────────── */}
      <View style={[styles.ctaBanner, { paddingHorizontal: hPad, paddingVertical: isMobile ? 64 : 88 }]}>
        <View style={styles.ctaGlow} />
        <Image
          source={require('../../assets/images/ash-oval-transparent.png')}
          style={styles.ctaLogo}
          resizeMode="contain"
        />
        <Text style={[styles.ctaH2, { fontSize: isMobile ? 24 : isTablet ? 30 : 38 }]}>
          Ready to stay cool?{'\n'}Book a service today.
        </Text>
        <Text style={styles.ctaSub}>
          Residential or commercial — our team is ready to help, 7 days a week.
        </Text>
        <View style={[styles.heroBtns, isMobile && { flexDirection: 'column', width: '100%' }]}>
          <Pressable
            onPress={goSignup}
            style={({ pressed }) => [
              styles.heroBtnPrimary,
              isMobile && { width: '100%', justifyContent: 'center' },
              pressed && { opacity: 0.88 },
            ]}
          >
            <Text style={styles.heroBtnPrimaryText}>Request a Service</Text>
            <Feather name="arrow-right" size={16} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => Linking.openURL('tel:+63277291293')}
            style={({ pressed }) => [
              styles.heroBtnSecondary,
              isMobile && { width: '100%', alignItems: 'center' },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Feather name="phone" size={15} color={GREEN} style={{ marginRight: 8 }} />
            <Text style={[styles.heroBtnSecondaryText, { color: GREEN }]}>Call +63 (2) 77291293</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Footer ─────────────────────────────────────── */}
      <View style={[styles.footer, { paddingHorizontal: hPad }]}>
        {/* Top */}
        <View style={[
          styles.footerTop,
          isMobile && { flexDirection: 'column', gap: 28 },
        ]}>
          {/* Brand */}
          <View style={styles.footerBrand}>
            <Image
              source={require('../../assets/images/ash-oval-transparent.png')}
              style={styles.footerLogo}
              resizeMode="contain"
            />
            <View>
              <Text style={styles.footerBrandName}>Ashcol Airconditioning</Text>
              <Text style={styles.footerBrandTag}>"Keeping YOU Cool" since 2014</Text>
            </View>
          </View>

          {/* Quick info */}
          {!isMobile && (
            <View style={styles.footerInfo}>
              <View style={styles.footerInfoRow}>
                <Feather name="map-pin" size={13} color={TEXT3} />
                <Text style={styles.footerInfoText}>Units 4D &amp; 4E, 4/F Genesis Building, 182-A J.P. Rizal Ext., Makati City</Text>
              </View>
              <View style={styles.footerInfoRow}>
                <Feather name="phone" size={13} color={TEXT3} />
                <Text style={styles.footerInfoText}>+63 (2) 77291293  ·  +63 (917) 7143810</Text>
              </View>
              <View style={styles.footerInfoRow}>
                <Feather name="mail" size={13} color={TEXT3} />
                <Text style={styles.footerInfoText}>headoffice@ashcol.com.ph</Text>
              </View>
            </View>
          )}

          {/* Portal links */}
          <View style={styles.footerPortal}>
            <Text style={styles.footerPortalHead}>Staff Portal</Text>
            <Pressable onPress={goLogin}>
              <Text style={styles.footerLink}>Sign In</Text>
            </Pressable>
            <Pressable onPress={goSignup}>
              <Text style={styles.footerLink}>Create Account</Text>
            </Pressable>
          </View>
        </View>

        {/* Bottom */}
        <View style={[styles.footerBottom, isMobile && { flexDirection: 'column', gap: 8 }]}>
          <Text style={styles.footerCopy}>© 2026 Ashcol Airconditioning Services Corporation. All rights reserved.</Text>
        </View>
      </View>
    </ScrollView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page:        { flex: 1, backgroundColor: BG },
  pageContent: { flexGrow: 1 },

  // ── Nav ──────────────────────────────────────────────
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: 'rgba(6,11,24,0.95)' as any,
    // @ts-ignore
    backdropFilter: 'blur(16px)',
    position: 'sticky' as any,
    top: 0,
    zIndex: 100,
  },
  navBrand:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navLogoImg:   { width: 36, height: 36 },
  navBrandText: { fontSize: 17, fontWeight: '800', color: TEXT1, letterSpacing: 0.2 },
  navBrandSub:  { fontSize: 11, color: TEXT3, fontWeight: '500', marginTop: 1 },
  navLinks:     { flexDirection: 'row', gap: 24, alignItems: 'center' },
  navLink:      { fontSize: 14, color: TEXT2, fontWeight: '500' },
  navActions:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navSignIn: {
    paddingVertical: 9, paddingHorizontal: 18,
    borderRadius: 8, borderWidth: 1, borderColor: BORDER2,
  },
  navSignInText: { fontSize: 14, color: TEXT2, fontWeight: '600' },
  navCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 9, paddingHorizontal: 18, borderRadius: 8, backgroundColor: GREEN,
    // @ts-ignore
    boxShadow: '0 4px 16px rgba(16,185,129,0.28)',
  },
  navCtaText: { fontSize: 14, color: '#fff', fontWeight: '700' },

  // ── Hero ─────────────────────────────────────────────
  hero: { alignItems: 'center', overflow: 'hidden', position: 'relative' },
  glowOrbLeft: {
    position: 'absolute', top: -80, left: -120,
    width: 480, height: 480, borderRadius: 240,
    backgroundColor: 'rgba(16,185,129,0.06)',
    // @ts-ignore
    filter: 'blur(80px)',
  },
  glowOrbRight: {
    position: 'absolute', top: 40, right: -140,
    width: 380, height: 380, borderRadius: 190,
    backgroundColor: 'rgba(59,130,246,0.05)',
    // @ts-ignore
    filter: 'blur(90px)',
  },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: GREENLO, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)',
    paddingVertical: 7, paddingHorizontal: 16, borderRadius: 24, marginBottom: 28,
  },
  heroBadgePulse: {
    width: 7, height: 7, borderRadius: 4, backgroundColor: GREEN,
    // @ts-ignore
    boxShadow: '0 0 8px rgba(16,185,129,0.8)',
  },
  heroBadgeText: { fontSize: 12, color: GREEN, fontWeight: '700', letterSpacing: 0.5 },

  heroH1: { fontWeight: '800', color: TEXT1, textAlign: 'center', letterSpacing: -1.4, marginBottom: 4, maxWidth: 780 },
  heroH1Accent: { color: GREEN },
  heroTagline: {
    fontSize: 18, fontStyle: 'italic', color: TEXT2, fontWeight: '500',
    marginBottom: 20, textAlign: 'center',
  },
  heroSub: {
    color: TEXT2, textAlign: 'center', lineHeight: 30,
    maxWidth: 580, marginBottom: 40,
  },
  heroBtns: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 36 },
  heroBtnPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: GREEN,
    paddingVertical: 15, paddingHorizontal: 30, borderRadius: 12,
    // @ts-ignore
    boxShadow: '0 8px 32px rgba(16,185,129,0.32)',
  },
  heroBtnPrimaryText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  heroBtnSecondary: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 15, paddingHorizontal: 28, borderRadius: 12,
    borderWidth: 1, borderColor: BORDER2, backgroundColor: CARD,
  },
  heroBtnSecondaryText: { fontSize: 15, fontWeight: '600', color: TEXT2 },

  heroContactStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18,
    alignSelf: 'stretch', justifyContent: 'center', marginTop: 8,
  },
  heroContactIcon: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: GREENLO,
    alignItems: 'center', justifyContent: 'center',
  },
  heroContactText: { fontSize: 13, color: TEXT2 },
  heroContactNum:  { color: GREEN, fontWeight: '700' },

  // ── Stats bar ────────────────────────────────────────
  statsBar: {
    flexDirection: 'row', flexWrap: 'wrap',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: BORDER,
    backgroundColor: SURFACE,
  },
  statCell: {
    flex: 1, minWidth: 120, alignItems: 'center', gap: 4,
    paddingVertical: 24, paddingHorizontal: 16,
  },
  statCellDivider: { borderRightWidth: 1, borderRightColor: BORDER },
  statIconWrap: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: GREENLO,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  statValue: { fontSize: 20, fontWeight: '800', color: TEXT1, letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: TEXT3, letterSpacing: 0.3, textAlign: 'center' },

  // ── Shared section ───────────────────────────────────
  section:    { alignItems: 'center', backgroundColor: BG },
  sectionAlt: { alignItems: 'center', backgroundColor: SURFACE, borderTopWidth: 1, borderBottomWidth: 1, borderColor: BORDER },
  sectionHeader: { alignItems: 'center', marginBottom: 44, gap: 12 },
  eyebrowPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: GREENLO, borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)',
    paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20,
  },
  eyebrowText: { fontSize: 10, fontWeight: '700', color: GREEN, letterSpacing: 2 },
  sectionH2: { fontWeight: '800', color: TEXT1, textAlign: 'center', letterSpacing: -1, lineHeight: 48 },
  sectionH3: { fontWeight: '700', color: TEXT1, textAlign: 'center', letterSpacing: -0.5 },
  sectionSub: { color: TEXT2, textAlign: 'center', lineHeight: 27, fontSize: 15, maxWidth: 520 },

  // ── Services ─────────────────────────────────────────
  servicesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, alignSelf: 'center' },
  serviceCard: {
    backgroundColor: CARD, borderRadius: 20, padding: 24,
    borderWidth: 1, overflow: 'hidden', position: 'relative', gap: 10,
  },
  serviceCardHover: { backgroundColor: CARD2, // @ts-ignore
    boxShadow: '0 16px 48px rgba(0,0,0,0.32)' },
  serviceAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  serviceIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  serviceTitle: { fontSize: 17, fontWeight: '700', color: TEXT1 },
  serviceDesc:  { fontSize: 13, color: TEXT2, lineHeight: 21, marginBottom: 4 },
  serviceDivider: { height: 1, backgroundColor: BORDER, marginVertical: 8 },
  serviceItem:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  serviceItemText: { fontSize: 13, color: TEXT2 },

  // ── Showcase ─────────────────────────────────────────
  showcaseGrid: {
    flexDirection: 'row',
    gap: 20,
    alignSelf: 'center',
    width: '100%',
    flexWrap: 'wrap',
  },
  showcaseMain: {
    flex: 2,
    minWidth: 320,
    height: 450,
  },
  showcaseSide: {
    flex: 1,
    minWidth: 300,
    gap: 20,
  },
  imageContainer: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BORDER,
  },
  imageContainerSmall: {
    height: 250,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BORDER,
  },
  showcaseLargeImg: {
    width: '100%',
    height: '100%',
  },
  showcaseSmallImg: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.4)' as any,
  },
  imageLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  quoteBox: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: BORDER,
    justifyContent: 'center',
    gap: 12,
  },
  quoteText: {
    fontSize: 16,
    color: TEXT1,
    lineHeight: 26,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  quoteAuthor: {
    fontSize: 13,
    color: GREEN,
    fontWeight: '600',
  },

  // ── About ────────────────────────────────────────────
  aboutGrid: {
    flexDirection: 'row', gap: 40, alignSelf: 'center',
    alignItems: 'flex-start',
  },
  aboutText: { flex: 1, gap: 14 },
  aboutPara: { fontSize: 14, color: TEXT2, lineHeight: 24 },
  aboutBadgeRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 4 },
  aboutBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: CARD2, borderWidth: 1, borderColor: BORDER2,
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10,
  },
  aboutBadgeText: { fontSize: 12, color: TEXT2, fontWeight: '600' },

  aboutCard: {
    width: 340, backgroundColor: CARD, borderRadius: 20,
    borderWidth: 1, borderColor: BORDER, padding: 22, gap: 0,
  },
  aboutCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  aboutCardHeaderText: { fontSize: 15, fontWeight: '700', color: TEXT1 },

  contactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  contactIconWrap: {
    width: 32, height: 32, borderRadius: 9, backgroundColor: GREENLO,
    alignItems: 'center', justifyContent: 'center',
  },
  contactLabel: { fontSize: 11, color: TEXT3, fontWeight: '600', letterSpacing: 0.3, marginBottom: 2 },
  contactValue: { fontSize: 13, color: TEXT2, fontWeight: '500' },

  contactHours: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    marginTop: 14, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: BORDER,
  },
  contactHoursText: { fontSize: 12, color: TEXT3, lineHeight: 18, flex: 1 },

  fbBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 14, backgroundColor: '#1877F2', borderRadius: 10,
    paddingVertical: 12,
  },
  fbBtnText: { fontSize: 14, color: '#fff', fontWeight: '700' },

  // ── CTA banner ───────────────────────────────────────
  ctaBanner: {
    alignItems: 'center', gap: 16, backgroundColor: SURFACE,
    borderTopWidth: 1, borderColor: BORDER,
    overflow: 'hidden', position: 'relative',
  },
  ctaGlow: {
    position: 'absolute', top: -100,
    width: 600, height: 600, borderRadius: 300,
    backgroundColor: 'rgba(16,185,129,0.05)',
    // @ts-ignore
    filter: 'blur(100px)',
  },
  ctaLogo: { width: 52, height: 52, opacity: 0.9 },
  ctaH2:  { fontWeight: '800', color: TEXT1, textAlign: 'center', letterSpacing: -0.8, lineHeight: 52, maxWidth: 560 },
  ctaSub: { color: TEXT2, textAlign: 'center', fontSize: 15, lineHeight: 26, maxWidth: 440, marginBottom: 8 },

  // ── Footer ───────────────────────────────────────────
  footer: { backgroundColor: BG, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 44, paddingBottom: 28 },
  footerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 },
  footerBrand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footerLogo: { width: 34, height: 34, opacity: 0.85 },
  footerBrandName: { fontSize: 15, fontWeight: '800', color: TEXT2 },
  footerBrandTag:  { fontSize: 11, color: TEXT3, fontStyle: 'italic', marginTop: 2 },
  footerInfo: { gap: 8 },
  footerInfoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  footerInfoText: { fontSize: 12, color: TEXT3, lineHeight: 18 },
  footerPortal: { gap: 8 },
  footerPortalHead: { fontSize: 12, fontWeight: '700', color: TEXT3, letterSpacing: 0.8, marginBottom: 2 },
  footerLink: { fontSize: 13, color: TEXT2, fontWeight: '500' },
  footerBottom: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 20,
  },
  footerCopy: { fontSize: 12, color: TEXT3 },
})
