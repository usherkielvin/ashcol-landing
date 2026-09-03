// ASHCOL portal service worker — Web Push only. No offline caching (the portal is data-heavy and
// always needs a live connection; caching pages here would risk showing stale ticket data).

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', event => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'ASHCOL', body: event.data.text() }
  }

  const title = payload.title || 'ASHCOL'
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { link: payload.link || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        const url = new URL(client.url)
        if (url.origin === self.location.origin && 'focus' in client) {
          client.navigate(link)
          return client.focus()
        }
      }
      return self.clients.openWindow(link)
    })
  )
})
