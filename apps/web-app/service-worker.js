/* oxlint-disable effect/avoid-native-fetch, custom-lint-rules/no-direct-fetch -- This standalone service worker has no Effect runtime; the fallback only fetches public shell files. */
const assets = __PRECACHE_ASSETS__
const cacheName = __PRECACHE_NAME__

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(assets)))
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("gororobas-shell-") && key !== cacheName)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)

  // Only the public shell is cached; credentials, API results and media stay online-only.
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/")
  ) {
    return
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      caches
        .open(cacheName)
        .then((cache) =>
          cache.match("/index.html").then((response) => response ?? fetch(event.request)),
        ),
    )
  } else if (assets.includes(url.pathname)) {
    event.respondWith(
      caches
        .open(cacheName)
        .then((cache) =>
          cache.match(url.pathname).then((response) => response ?? fetch(event.request)),
        ),
    )
  }
})
