// Oposición · servicio para usar la app sin conexión.
// Todo lo que la app pide se guarda en el móvil. Después se sirve desde ahí al
// momento y, si hay conexión, se actualiza por detrás para la próxima vez.
const CACHE = 'opo-movil-3';
const BASE = ['./', 'index.html', 'estilo.css', 'app.js', 'manifest.webmanifest',
  'icono-192.png', 'icono-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const pet = e.request;
  if (pet.method !== 'GET' || new URL(pet.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const guardada = await cache.match(pet);
    const deLaRed = fetch(pet).then(resp => {
      if (resp && resp.ok) cache.put(pet, resp.clone());
      return resp;
    });
    if (guardada) {
      deLaRed.catch(() => {});   // sin conexión: se queda con lo guardado
      return guardada;
    }
    return deLaRed;
  }));
});
