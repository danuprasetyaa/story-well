const DB_NAME = 'app-db';
const DB_VER = 1;

function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('pending')) db.createObjectStore('pending', { keyPath: 'tempId' });
      if (!db.objectStoreNames.contains('auth')) db.createObjectStore('auth', { keyPath: 'key' });
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function idbPut(store, value) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function idbGetAll(store) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const rq = tx.objectStore(store).getAll();
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}

export async function idbDelete(store, key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function saveItem(store, value) {
  await idbPut(store, value);
}

export async function saveAuthToken(token) {
  await idbPut('auth', { key: 'token', value: token });
}

// dipakai ketika add story (offline-first)
export async function queuePendingForm({ formData, description }) {
  await idbPut('pending', {
    tempId: 'tmp-' + Date.now(),
    formData,
    description
  });
  const reg = await navigator.serviceWorker.ready;
  await reg.sync.register('sync-pending');
}
