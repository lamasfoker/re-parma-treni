// Service worker minimale: cache dell'app shell (index.html, manifest),
// mai le chiamate cross-origin verso il CORS-proxy/ViaggiaTreno (dati live,
// mai da servire dalla cache). Strategia network-first per la navigazione,
// cosi' un redeploy non lascia utenti bloccati su una versione stale.
const CACHE_NAME = 'rpt-shell-v1';
const SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // mai proxy.cors.sh / viaggiatreno.it

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) e.waitUntil(caches.open(CACHE_NAME).then((c) => c.put(e.request, res.clone())));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request)));
});
