/* js: sw — offline only. Install does not need this (manifest + HTTPS is enough). */
const VERSION = "kaburi-v1";
const PRECACHE = [
  "/", "/app.css", "/app.js", "/boot.js", "/manifest.json",
  "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // App shell: network first so a deploy shows up on the next open, cache when offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((r) => {
        if (r.ok && !r.redirected) caches.open(VERSION).then((c) => c.put("/", r.clone()));
        return r;
      }).catch(() => caches.match("/"))
    );
    return;
  }

  // Everything else: cache first, refresh in the background.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((r) => {
        if (r.ok) caches.open(VERSION).then((c) => c.put(req, r.clone()));
        return r;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
