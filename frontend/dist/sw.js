/* The build injects a revision and the actual list of hashed assets. */
const SCOPE = new URL(self.registration.scope)
const BASE = SCOPE.pathname
const INDEX = BASE + 'index.html'
const PREFIX = 'show-tracker-shell-' + BASE + ':'
const SHELL = PREFIX + "5b9e9c29056954a4"
const ASSETS = ["assets/index-C3SAWfBU.css","assets/index-DPP8DjMe.js","icon-192.png","icon-512.png","icon-maskable-512.png","index.html","manifest.webmanifest"].map(name => BASE + name)
const precached = new Set(ASSETS)

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(
    ASSETS.map(path => new Request(path, { cache: 'reload' })),
  )))
})

self.addEventListener('message', event => {
  if (event.data === 'tracker-update') event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names
      .filter(name => name !== SHELL && (name.startsWith(PREFIX)
        || (BASE === '/' && /^show-tracker-shell-[a-f0-9]{16}$/.test(name))))
      .map(name => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== SCOPE.origin) return
  if (request.mode === 'navigate' && (url.pathname === BASE || url.pathname === INDEX)) {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(SHELL)
      return await cache.match(INDEX) || Response.error()
    }))
  } else if (precached.has(url.pathname) && url.pathname !== INDEX) {
    event.respondWith(caches.open(SHELL).then(async cache => await cache.match(url.pathname) || fetch(request)))
  }
})
