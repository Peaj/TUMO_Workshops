// Service worker: offline app shell, fresh lesson data, and notification clicks.
// Network first with cache fallback; VERSION only names the cache.

const VERSION = "1.0.0";
const CACHE = `tumo-${VERSION}`;

const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "pocket-test.html",
  "css/app.css",
  "js/main.js",
  "js/alerts.js",
  "js/clock.js",
  "js/cues.js",
  "js/data.js",
  "js/groups.js",
  "js/i18n.js",
  "js/push.js",
  "js/icons.js",
  "js/settings.js",
  "js/store.js",
  "js/sync.js",
  "js/ticks.js",
  "js/ui.js",
  "js/util.js",
  "js/version.js",
  "js/vendor/qrcode.js",
  "js/views/beamer.js",
  "js/views/home.js",
  "js/views/legend.js",
  "js/views/minimap.js",
  "js/views/session.js",
  "js/views/settings.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/badge-96.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("tumo-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Network first for everything, so a deploy is live on the next load without a
// version bump. The cache is the fallback when offline or when the network is slow.
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const fresh = fetch(request, { cache: "no-cache" }).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  if (!cached) return fresh;
  fresh.catch(() => {}); // keeps updating the cache in the background
  const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), 2500));
  return Promise.race([fresh.catch(() => cached), timeout]);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // the sync relay goes straight to the network
  event.respondWith(networkFirst(request));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      if (list.length) return list[0].focus();
      return self.clients.openWindow("./");
    })
  );
});
