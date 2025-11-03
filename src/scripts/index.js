// ====================== IMPORT ======================
import { saveAuthToken, queuePendingForm } from './idb.js';
import { initPushToggle, triggerInstall } from './pwa.js';

import StoryApiSource from './data/story-api-source.js';
import MainView from './view/main-view.js';
import '../styles/style.css';

// =====================================================

// Buat instance view
const view = new MainView();

// ---------------- APP HANDLERS ----------------------
const App = {
  async login(email, password) {
    const loginResult = await StoryApiSource.login(email, password);
    sessionStorage.setItem('authToken', loginResult.token);
    sessionStorage.setItem('userName', loginResult.name);
    // simpan token di IndexedDB untuk BG Sync
    await saveAuthToken(loginResult.token);
    window.location.hash = '#/';
  },

  async register(name, email, password) {
    await StoryApiSource.register(name, email, password);
    alert('Registrasi berhasil! Silakan login.');
    window.location.hash = '#/login';
  },

  async addStory(formData) {
    try {
      await StoryApiSource.postStory(formData);

      // Tampilkan notofikasi secara lokal ( Client-side ) setelah sukses
      if ( 'serviceWorker' in navigator ) {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification('Story Well', {
          body: " Cerita berhasil di publikasikan.",
          icon: '/src/icons/icon-192.png',
          badge: '/src/icons/badge-72.png',
          tag:'story-post-success'
        });
      }
    } catch {
      // jika offline → antrikan untuk background sync
      await queuePendingForm({
        formData,
        description: formData.get('description')
      });

      // Notifikasi bahwa cerita di-antrian
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification('Story Well', {
          body: 'Offline: cerita akan dikirim saat online.',
          icon: '/src/icons/icon-192.png',
          badge: '/src/icons/badge-72.png',
          tag: 'story-queued'
        });
      }

      alert('Offline: cerita akan dikirim saat online.');
    }
  }
};



// --------- SERVICE WORKER REGISTER -------------------
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./service-worker.js', { scope: '/' });
    console.log('SW registered:', reg.scope);
  } catch (err) {
    console.error('SW register failed:', err);
  }
}

// --------- HELPER LOGIN STATE ------------------------
function isUserLoggedIn() {
  return !!sessionStorage.getItem('authToken');
}

function updateNavLinksVisibility() {
  const isLoggedIn = isUserLoggedIn();
  const dashboardLink = document.getElementById('dashboard-link');
  const addStoryLink = document.getElementById('add-story-link');
  const logoutButton = document.getElementById('logout-button');
  const savedLink = document.getElementById('saved-link');

  if (!dashboardLink || !addStoryLink || !logoutButton || !savedLink) return;

  if (isLoggedIn) {
    dashboardLink.style.display = 'inline';
    addStoryLink.style.display = 'inline';
    savedLink.style.display = 'inline';
    logoutButton.style.display = 'inline-block';
  } else {
    dashboardLink.style.display = 'none';
    addStoryLink.style.display = 'none';
    savedLink.style.display = 'none';
    logoutButton.style.display = 'none';
  }
}

// -------------- ROUTER -------------------------------
const routes = {
  '/': async () => {
    const stories = await StoryApiSource.getStories();
    const userName = sessionStorage.getItem('userName') || 'User';
    view.renderDashboard(stories, userName);
  },
  '/add': () => {
    view.renderAddStoryPage(App.addStory);
  },
  '/login': () => {
    view.renderLoginPage(App.login);
  },
  '/register': () => {
    view.renderRegisterPage(App.register);
  },
  '/saved': async () => {
    await view.renderSavedStoriesPage();
  },
};

function handleRouteChange() {
  const hash = window.location.hash || '#/';
  const route = hash.substring(1);

  // proteksi route
  const isProtectedRoute = ['/', '/add'].includes(route);
  if (isProtectedRoute && !isUserLoggedIn()) {
    window.location.hash = '#/login';
    return;
  }
  if (route === '/login' && isUserLoggedIn()) {
    window.location.hash = '#/';
    return;
  }

  // atur layout auth
  const authRoutes = ['/login', '/register'];
  document.body.classList.toggle('auth-page', authRoutes.includes(route));
  updateNavLinksVisibility();

  // render page
  const pageRenderer = routes[route] || routes['/'];
  if (document.startViewTransition) {
    document.startViewTransition(() => pageRenderer());
  } else {
    pageRenderer();
  }
}

// -------------- EVENT LISTENERS ----------------------
window.addEventListener('DOMContentLoaded', async () => {
  handleRouteChange();

  const logoutButton = document.getElementById('logout-button');
  if (logoutButton) {
    logoutButton.addEventListener('click', (event) => {
      event.preventDefault();
      sessionStorage.clear();
      window.location.hash = '#/login';
      handleRouteChange();
    });
  }

  await registerServiceWorker();

  // init push toggle
  initPushToggle();

  const installBtn = document.getElementById('install-btn');
  installBtn?.addEventListener('click', triggerInstall);
});

window.addEventListener('hashchange', handleRouteChange);
