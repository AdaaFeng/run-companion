const CACHE_NAME = "run-companion-v2-zephyr-sports";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./audio/voice-pack.json",
  "./audio/generated/warmup_start.mp3",
  "./audio/generated/warmup_halfway.mp3",
  "./audio/generated/warmup_one_minute.mp3",
  "./audio/generated/run_halfway.mp3",
  "./audio/generated/run_last_50.mp3",
  "./audio/generated/walk_halfway.mp3",
  "./audio/generated/walk_last_50.mp3",
  "./audio/generated/paused.mp3",
  "./audio/generated/resumed.mp3",
  "./audio/generated/cooldown_start.mp3",
  "./audio/generated/finished.mp3",
  "./audio/generated/run_1.mp3",
  "./audio/generated/walk_1.mp3",
  "./audio/generated/run_2.mp3",
  "./audio/generated/walk_2.mp3",
  "./audio/generated/run_3.mp3",
  "./audio/generated/walk_3.mp3",
  "./audio/generated/run_4.mp3",
  "./audio/generated/walk_4.mp3",
  "./audio/generated/run_5.mp3",
  "./audio/generated/walk_5.mp3",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok && new URL(event.request.url).origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
