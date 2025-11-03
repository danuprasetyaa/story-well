// ========== INSTALL PROMPT ==========
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('install-btn');
  if (btn) btn.style.display = 'inline-flex';
});


export async function triggerInstall() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  if (choice.outcome === 'accepted') {
    console.log('User accepted the A2HS prompt');
  } else {
    console.log('User dismissed the A2HS prompt');
  }
  deferredPrompt = null;
  document.getElementById('install-btn').style.display = 'none';
}

// ========== PUSH TOGGLE ==========1
const VAPID_PUBLIC_KEY = 'BCCs2eonMI-6H2ctvFaWg-UYdDv387Vno_bzUzALpB442r2lCnsHmtrx8biyPi_E-1fSGABK_Qs_GlvPoJJqxbk'; // base64-url

function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function initPushToggle() {
  const btn = document.getElementById('notification-toggle');
  if (!btn || !('serviceWorker' in navigator) || !('PushManager' in window)) return;

  const reg = await navigator.serviceWorker.ready;
  const current = await reg.pushManager.getSubscription();
  btn.textContent = current ? '🔕' : '🔔';
  btn.setAttribute('aria-pressed', current ? 'true' : 'false');

  btn.addEventListener('click', async () => {
    const have = await reg.pushManager.getSubscription();
    if (have) {
      await have.unsubscribe();
      // TODO: hit API unsubscribe (jika ada)
      btn.textContent = '🔔';
      btn.setAttribute('aria-pressed', 'false');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    // TODO: kirim sub ke server-mu: fetch('/api/push/subscribe', {method:'POST', body: JSON.stringify(sub)})
    btn.textContent = '🔕';
    btn.setAttribute('aria-pressed', 'true');
  });
}
