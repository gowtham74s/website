/* Forge service worker — offline app shell + notification handling.
   Data requests (Supabase, /api) are never cached here; the app keeps its own
   persisted query cache and offline write queue. */
const VERSION = "forge-v1";
const SHELL = ["/", "/workout", "/nutrition", "/calendar", "/progress", "/habits", "/settings", "/hydration", "/activity", "/sleep", "/analytics", "/assistant", "/login", "/offline.html"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && url.pathname.startsWith("/api/")) return;
  if (!sameOrigin && !/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(url.pathname, copy)); return res; })
        .catch(async () => (await caches.match(url.pathname)) || (await caches.match("/")) || caches.match("/offline.html")),
    );
    return;
  }
  // static assets: stale-while-revalidate
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => { if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; }).catch(() => hit);
      return hit || net;
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ("focus" in c) { c.navigate(target); return c.focus(); } }
    return self.clients.openWindow(target);
  }));
});

// Ready for Web Push if a push server is added later.
self.addEventListener("push", (e) => {
  const d = e.data ? e.data.json() : { title: "Forge", body: "" };
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: d.url || "/" } }));
});
