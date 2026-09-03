import { API_BASE_URL } from './api'

function getToken() {
  return localStorage.getItem('ashcol-token') || sessionStorage.getItem('ashcol-token') || ''
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  }
}

/** iOS Safari only allows push from a page launched off the home-screen icon (added-to-home-screen
 *  PWA), never from a regular Safari tab — even on iOS 16.4+. Android/desktop have no such restriction. */
export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** iOS can technically support push (16.4+) but only once running as an installed PWA. */
export function pushBlockedReason(): string | null {
  if (!isPushSupported()) return 'Push notifications aren’t supported in this browser.'
  if (isIos() && !isStandalone()) {
    return 'On iPhone, add ASHCOL to your Home Screen first (Share → Add to Home Screen), then open it from there to enable notifications.'
  }
  return null
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch (err) {
    console.error('[push] Service worker registration failed:', err)
    return null
  }
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return null
  return reg.pushManager.getSubscription()
}

export async function subscribeToPush(): Promise<{ ok: boolean; error?: string }> {
  const blocked = pushBlockedReason()
  if (blocked) return { ok: false, error: blocked }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, error: 'Notification permission was not granted.' }
  }

  const reg = await registerServiceWorker()
  if (!reg) return { ok: false, error: 'Could not register the service worker.' }
  await navigator.serviceWorker.ready

  const keyRes = await fetch(`${API_BASE_URL}/push/vapid-public-key`, { headers: authHeaders() })
  if (!keyRes.ok) return { ok: false, error: 'Could not reach the server.' }
  const { publicKey } = await keyRes.json()
  if (!publicKey) return { ok: false, error: 'Push notifications are not configured on the server yet.' }

  let subscription = await reg.pushManager.getSubscription()
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    })
  }

  const json = subscription.toJSON()
  const res = await fetch(`${API_BASE_URL}/push/subscribe`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      userAgent: navigator.userAgent,
    }),
  })
  if (!res.ok) return { ok: false, error: 'Could not save the subscription on the server.' }

  return { ok: true }
}

export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getCurrentSubscription()
  if (!subscription) return
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  try {
    await fetch(`${API_BASE_URL}/push/unsubscribe`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ endpoint }),
    })
  } catch {
    // Best-effort — the local unsubscribe already succeeded.
  }
}
