/* Service Worker - Rekap Corr */
const VERSION = "v7";
const SHELL_CACHE = "rekap-corr-shell-" + VERSION;
const DATA_CACHE  = "rekap-corr-data-" + VERSION;
const CHART_URL = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js";
const SHELL = [
  "./", "./index.html", "./corrbhs.html", "./corrhs250.html", "./corrhs280.html", "./manifest.webmanifest",
  "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL_CACHE);
    await c.addAll(SHELL);
    try { await c.add(new Request(CHART_URL, { mode: "cors" })); } catch (_) {}
    self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => ![SHELL_CACHE, DATA_CACHE].includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", e => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Data Google Sheet: network-first, cadangan dari cache terakhir
  if (url.hostname === "docs.google.com") {
    e.respondWith((async () => {
      const key = url.origin + url.pathname + "?" + [...url.searchParams].filter(([k]) => k !== "_").map(([k, v]) => k + "=" + v).join("&");
      try {
        const res = await fetch(req, { cache: "no-store" });
        if (res.ok) (await caches.open(DATA_CACHE)).put(key, res.clone());
        return res;
      } catch (_) {
        const hit = await caches.match(key);
        return hit || new Response("", { status: 503, statusText: "Offline" });
      }
    })());
    return;
  }

  // Navigasi: network-first, fallback ke index.html di cache
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(SHELL_CACHE)).put(req, res.clone());
        return res;
      } catch (_) {
        return (await caches.match(req, { ignoreSearch: true })) || (await caches.match("./index.html"));
      }
    })());
    return;
  }

  // Aset statis (termasuk Chart.js CDN): cache-first
  if (url.origin === location.origin || url.href === CHART_URL) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(SHELL_CACHE)).put(req, res.clone());
        return res;
      } catch (_) { return Response.error(); }
    })());
  }
});
