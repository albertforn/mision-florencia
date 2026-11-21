/* Misión Florencia: offline cache. Change VERSION whenever you upload a new index.html. */
const VERSION = "2026-11-21a";
const FONT_CACHE = "mf-fonts";
const CORE = [
  "./", "./index.html", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png", "./icons/favicon-32.png"
];
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Della+Respira&family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap";

async function cacheFonts() {
  try {
    const c = await caches.open(FONT_CACHE);
    const res = await fetch(FONT_CSS, { mode: "cors" });
    if (!res.ok) return;
    await c.put(FONT_CSS, res.clone());
    const css = await res.text();
    const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)].map(m => m[1]);
    await Promise.all(urls.map(u => fetch(u, { mode: "cors" }).then(r => r.ok && c.put(u, r)).catch(() => {})));
  } catch (e) { /* offline or blocked: the page falls back to the phone's own fonts */ }
}

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(CORE.map(u => new Request(u, { cache: "reload" }))))
      .then(() => cacheFonts())
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FONT_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    /* Serve from the phone straight away; refresh the copy in the background when online. */
    const key = req.mode === "navigate" ? "./index.html" : req;
    const network = caches.open(VERSION).then(c =>
      fetch(req).then(res => { if (res.ok) c.put(key, res.clone()); return res; }).catch(() => null));
    e.waitUntil(network.then(() => {}));
    e.respondWith(
      caches.open(VERSION)
        .then(c => c.match(key, { ignoreSearch: true }))
        .then(hit => hit || network.then(res => res || new Response("Sin conexión", { status: 503 })))
    );
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(
      caches.open(FONT_CACHE).then(async c => {
        const hit = await c.match(req, { ignoreVary: true });
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok || res.type === "opaque") c.put(req, res.clone());
          return res;
        } catch (err) { return Response.error(); }
      })
    );
  }
});
