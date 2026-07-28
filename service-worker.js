const CACHE_VERSION = "v2";
const CACHE_NAME = "ledger-cache-" + CACHE_VERSION;
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./favicon.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          APP_SHELL.map((url) =>
            cache.add(url).catch((err) => {
              // Don't let one missing file (e.g. a not-yet-deployed icon) break install.
              console.warn("Ledger SW: couldn't cache", url, err);
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Always go straight to the network for live Google Sheet data
// (URLs that include script.google.com) so entries are always fresh — never cache these.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = req.url;

  if (req.method !== "GET" || url.includes("script.google.com")) {
    return;
  }

  // Navigations: try the network first, fall back to the cached app shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Everything else: cache-first, refresh in the background, network as fallback.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
