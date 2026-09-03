/* js: sw — offline shell + share target intake.
   Network first for everything: a deploy shows up on the very next open; the cache is only for offline.
   POST /share (Web Share Target) is parked in its own cache for the page to pick up; the page cannot
   read a POST body itself, only the worker can. */
const VERSION = "kaburi-v4";
const SHARE_CACHE = "kaburi-share";
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
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== SHARE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.method === "POST" && req.mode === "navigate" && url.pathname === "/share") {
    e.respondWith((async () => {
      /* Anyone can form-POST here; the worker cannot tell the share sheet from a cross-site form.
         So each payload is stamped with an unguessable token that also travels in the redirect:
         only the launch that created a payload is allowed to drain it. */
      let token = "";
      try {
        const form = await req.formData();
        const files = form.getAll("files").filter((f) => f && typeof f === "object" && "size" in f);
        const text = [form.get("title"), form.get("text"), form.get("url")]
          .filter((v) => typeof v === "string" && v.trim()).join("\n");
        const cache = await caches.open(SHARE_CACHE);
        token = self.crypto.randomUUID ? self.crypto.randomUUID()
          : Array.from(self.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
        await cache.put("/__share/meta", new Response(JSON.stringify({ count: files.length, text, at: Date.now(), nonce: token }),
          { headers: { "content-type": "application/json" } }));
        await Promise.all(files.map((f, i) =>
          cache.put("/__share/file-" + i, new Response(f, { headers: {
            "x-kaburi-name": encodeURIComponent(f.name || ""),       /* names can be CJK; headers must be ASCII */
            "content-type": f.type || "application/octet-stream"
          } }))));
      } catch (err) { /* fall through: the page shows an empty intake and clears up */ }
      return Response.redirect(new URL("/?share-target=" + encodeURIComponent(token), self.location.origin).href, 303);
    })());
    return;
  }

  if (req.method !== "GET") return;
  const nav = req.mode === "navigate";
  const key = nav ? "/" : req;

  e.respondWith(
    fetch(req).then((r) => {
      /* Every navigation is stored as the shell, so a navigation straight to a subresource — someone
         opening /icon-192.png in the address bar — must not be allowed to become the offline shell. */
      const storable = r.ok && !r.redirected &&
        (!nav || /text\/html/i.test(r.headers.get("content-type") || ""));
      if (storable) caches.open(VERSION).then((c) => c.put(key, r.clone()));
      return r;
    }).catch(() => caches.open(VERSION).then((c) => c.match(key)))   /* never fall back into the share cache */
  );
});
