const CACHE_VERSION = 'rocket-task-v1'
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/vite.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
    )
  )
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const isSameOrigin = url.origin === self.location.origin

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone()
          caches.open(CACHE_VERSION).then((cache) => cache.put('/index.html', clone))
          return response
        })
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  if (isSameOrigin) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached ||
        fetch(request)
          .then((response) => {
            const clone = response.clone()
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone))
            return response
          })
          .catch(() => cached)
      )
    )
  }
})
