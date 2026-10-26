const CACHE_NAME = "skillswap-static-v1";
const APP_ASSETS = [
  "/offline.html",
  "/pwa-192.png",
  "/pwa-512.png",
  "/apple-touch-icon.png",
  "/skillswap-symbol.png",
  "/skillswap-wordmark.png",
  "/skillswap-logo.png",
];

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() ?? "You have new activity in SkillSwap." };
  }
  const title = typeof payload.title === "string" ? payload.title : "SkillSwap";
  const body = typeof payload.body === "string" ? payload.body : "You have a new session update.";
  const rawHref = typeof payload.href === "string" ? payload.href : "/sessions";
  let href = "/sessions";
  try {
    const url = new URL(rawHref, self.location.origin);
    if (url.origin === self.location.origin) href = `${url.pathname}${url.search}${url.hash}`;
  } catch {
    // Use the session list when the supplied path is malformed.
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/pwa-192.png",
      badge: "/skillswap-symbol.png",
      data: { href },
      tag: `skillswap-${href}`,
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawHref = typeof event.notification.data?.href === "string"
    ? event.notification.data.href
    : "/sessions";
  let target = new URL("/sessions", self.location.origin);
  try {
    const candidate = new URL(rawHref, self.location.origin);
    if (candidate.origin === self.location.origin) target = candidate;
  } catch {
    // Keep the safe default.
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const sameOriginClient = clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (sameOriginClient) {
        return sameOriginClient.navigate(target.href).then((client) => client?.focus());
      }
      return self.clients.openWindow(target.href);
    }),
  );
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("skillswap-static-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        return (
          (await caches.match("/offline.html")) ??
          new Response("You are offline. Reconnect to use SkillSwap.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/api/auth/")) return;

  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") || APP_ASSETS.includes(url.pathname);
  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
