/* ====== CONFIG ====== */
const APP_CACHE  = 'app-shell-v2';
const DATA_CACHE = 'data-cache-v1';

const APP_SHELL = [
  '/', 
  '/index.html',
  '/bundle.js',
  '/styles/style.css',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/badge-72.png',
];

/* ====== INSTALL: cache app shell ====== */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(APP_CACHE).then((cache) =>
      // gunakan Request agar URL path konsisten
      cache.addAll(APP_SHELL.map(p => new Request(p, { cache: 'reload' })))
    )
  );
  self.skipWaiting();
});

/* ====== ACTIVATE: bersihkan cache lama ====== */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => {
        if (![APP_CACHE, DATA_CACHE].includes(k)) return caches.delete(k);
      }))
    )
  );
  self.clients.claim();
});

/* ====== FETCH ====== */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 0) Hanya tangani GET
  if (req.method !== 'GET') return;

  // 1) Abaikan request HMR/WebSocket dari webpack-dev-server (biar tidak di-cache)
  if (
    url.hostname === 'localhost' && (
      url.pathname.includes('hot-update') ||
      url.pathname.startsWith('/ws') ||
      url.pathname.endsWith('/sockjs-node')
    )
  ) {
    return; // lepas ke jaringan
  }

 // 2) SPA navigation fallback (offline): semua navigasi ke index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then((r) => r || fetch('/index.html'))
    );
    return;
  }

  // 3) App shell static (origin sendiri): cache-first
  if (url.origin === location.origin && APP_SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
    return;
  }

  // 4) Data API Dicoding: network-first (cache GET saja)
  if (url.hostname === 'story-api.dicoding.dev') {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);              // coba jaringan dahulu
        const cache = await caches.open(DATA_CACHE);
        cache.put(req, net.clone());               // simpan hanya GET
        return net;
      } catch {
        const cached = await caches.match(req);    // fallback cache saat offline
        if (cached) return cached;
        return new Response(JSON.stringify({ offline: true, listStory: [] }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    })());
    return;
  }

  // 5) Default: coba dari cache dulu lalu jaringan
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});

/* ====== PUSH: notifikasi dinamis + action ke halaman ====== */
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    // 1) Jika izin belum di-grant, jangan panggil showNotification
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      return;
    }

    // 2) Default values
    let title = 'Story Well';
    let body  = 'Ada cerita baru. Lihat detailnya!';
    let icon  = './icons/icon-192.png';
    let url   = '/#/';     // halaman yang dibuka saat diklik
    let tag   = 'story';   // supaya notifikasi serupa di-replace

    // 3) Coba parse JSON; jika gagal, pakai text() sebagai body
    if (event.data) {
      try {
        const data = event.data.json();
        title = data.title ?? title;
        body  = data.body  ?? body;
        icon  = data.icon  ?? icon;
        url   = data.url   ?? url;
        tag   = data.id ? `story-${data.id}` : tag;
      } catch {
        body = await event.data.text(); // payload bukan JSON
      }
    }

    return self.registration.showNotification(title, {
      body,
      icon,
      badge: './icons/badge-72.png',
      tag,
      data: { url },
      actions: [
        { action: 'open',    title: 'Buka'  },
        { action: 'dismiss', title: 'Tutup' }
      ]
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/#/';
  event.waitUntil((async () => {
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      // fokuskan tab yang sudah ada + arahkan kalau perlu
      try { w.navigate && w.navigate(url); } catch {}
      if ('focus' in w) return w.focus();
    }
    return clients.openWindow(url);
  })());
});

/* ====== IndexedDB mini util (untuk Background Sync) ====== */
function idbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('app-db', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('items'))   db.createObjectStore('items',   { keyPath: 'id' });
      if (!db.objectStoreNames.contains('pending')) db.createObjectStore('pending', { keyPath: 'tempId' });
      if (!db.objectStoreNames.contains('auth'))    db.createObjectStore('auth',    { keyPath: 'key' });
    };
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}
async function idbGetAll(store) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const rq = tx.objectStore(store).getAll();
    rq.onsuccess = () => res(rq.result);
    rq.onerror   = () => rej(rq.error);
  });
}
async function idbDelete(store, key) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => res();
    tx.onerror    = () => rej(tx.error);
  });
}

/* ====== BACKGROUND SYNC: kirim pending post saat online ====== */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending') event.waitUntil(syncPending());
});

async function syncPending() {
  const pendings = await idbGetAll('pending');
  if (!pendings.length) return;

  const [auth] = await idbGetAll('auth'); // { key:'token', value:'...' }
  const token = auth?.value || '';

  for (const p of pendings) {
    try {
      const resp = await fetch('https://story-api.dicoding.dev/v1/stories', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: p.formData
      });
      if (!resp.ok) continue;
      await idbDelete('pending', p.tempId);
      self.registration.showNotification('Sinkronisasi Berhasil', {
        body: p.description || 'Cerita tersimpan.'
      });
    } catch {/* coba lagi pada sync berikutnya */}
  }
}
