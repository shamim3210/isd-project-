// LibraryMS service worker — caches the app shell so the UI still loads
// (with a "you're offline" state for data) when there's no connection.
// Note: this caches static files only. Book data always needs a live
// connection to the backend; true offline *data* browsing would need an
// additional local data cache layer, which isn't included here.

const CACHE_NAME = "libraryms-shell-v1";
const SHELL_FILES = [
  "./index.html",
  "./style.css",
  "./app.js",
  "./i18n.js",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls — always go to the network so data stays fresh.
  if (url.pathname.startsWith("/api")) return;

  // App shell: cache-first, falling back to network, falling back to the
  // cached index.html for navigations so the app still opens offline.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => {
        if (event.request.mode === "navigate") return caches.match("./index.html");
      });
    })
  );
});
