// Uygulama dosyalarını önbelleğe alır; önce ağdan dener ki güncellemeler hemen gelsin.
const CACHE = 'drivetalk-v3';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/speech.js',
  'js/gemini.js',
  'js/tutor.js',
  'js/commands.js',
  'js/store.js',
  'js/lookup.js',
  'js/live.js',
  'js/live-mock.js',
  'js/pcm-worklet.js',
  'js/media-keys.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Gemini API çağrıları gibi başka adreslere giden istekler önbelleğe alınmaz.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })),
  );
});
