/** App entry point. */

import { navigate, restoreScroll } from './core/nav.js';
import { route } from './core/router.js';
import { loadSession } from './ui/session.js';
import { wireHeaderMenus } from './ui/headerMenus.js';
import { wireNavShortcuts } from './ui/chrome.js';
import { wireTheme } from './ui/theme.js';
import { wireChromeAutoHide } from './ui/chromeAutoHide.js';
import { wireImageFallbacks } from './lib/imageFallback.js';
import { wireImageDownloads } from './lib/imageDownload.js';
import { wireStaticAvatars } from './lib/avatarStatic.js';
import { wirePostScreenshots } from './lib/postScreenshot.js';
import { wireAllQuoteExpansion } from './lib/quotes.js';
import { wireLightbox } from './ui/lightbox.js';
import { wireFilteredReveals, revealFilteredBlock } from './filters/apply.js';

// Pre-paint theme application; the localStorage preference is synchronous.
wireTheme();

// SPA navigation: intercept same-origin link clicks.
document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest('a[href]');
  if (!link) return;
  const href = link.getAttribute('href');
  if (!href || link.target === '_blank' || link.hasAttribute('download')) return;
  const url = new URL(link.href, location.origin);
  if (url.origin !== location.origin) return;
  if (/^\/(api|assets|userscript)\//.test(url.pathname)) return;
  // Same-page #post links scroll in place; align top, not center.
  if (url.pathname === location.pathname && url.search === location.search && url.hash) {
    const target = document.getElementById(url.hash.slice(1));
    if (target) {
      event.preventDefault();
      // Reveal filtered content before landing on its placeholder.
      revealFilteredBlock(target);
      target.scrollIntoView({ block: 'start' });
      // Keep history.state: replaceState({}) wipes the scroll key.
      history.replaceState({ ...(history.state || {}) }, '', url.pathname + url.search + url.hash);
    }
    return;
  }
  event.preventDefault();
  navigate(url.pathname + url.search + url.hash);
});

wireHeaderMenus();
wireNavShortcuts();
wireChromeAutoHide();
// voz.vn unfurl favicons use data-onerror="hide-parent" for dead images.
wireImageFallbacks();
wireImageDownloads();
wireStaticAvatars();
wirePostScreenshots();
wireAllQuoteExpansion();
wireLightbox();
wireFilteredReveals();

// Back/forward restores remembered scroll; scrollRestoration is manual.
window.addEventListener('popstate', async () => {
  await route();
  restoreScroll();
});

// Full-numbers setting re-renders in place (strings are baked into markup).
window.addEventListener('voz:format-change', async () => {
  if (location.pathname.startsWith('/cai-dat-tuivoz')) return;
  const top = window.scrollY;
  await route();
  window.scrollTo({ top });
});

// on = re-render, off = drop strikethroughs; import must be absolute.
window.addEventListener('voz:banned-users-change', async (event) => {
  const { clearBannedMarks } = await import('/assets/lib/bannedUsers.js');
  const mode = event.detail && event.detail.mode;
  if (!mode || mode === 'off') {
    clearBannedMarks(document);
    return;
  }
  if (location.pathname.startsWith('/cai-dat-tuivoz')) return;
  const top = window.scrollY;
  await route();
  window.scrollTo({ top });
});

(async function boot() {
  // Legacy #/t/123 hash URLs rewrite to the path form.
  if (location.hash.startsWith('#/')) {
    history.replaceState({ ...(history.state || {}) }, '', location.hash.slice(1));
  }
  // Maintenance gate; a 404 means the custom router isn't deployed — tolerate.
  try {
    const { api } = await import('./api.js');
    const cfg = await api.appConfig();
    const m = cfg && cfg.maintenance;
    if (m && m.active) {
      const host = document.getElementById('app');
      host.innerHTML = '<div class="block"><div class="block-header">Bảo trì</div><div class="block-body block-body--pad"><p></p></div></div>';
      host.querySelector('p').textContent = m.message || 'voz.vn đang bảo trì, thử lại sau.';
    }
    document.dispatchEvent(new CustomEvent('voz:app-config', { detail: cfg }));
  } catch { /* 404 tolerated: endpoint absent on this deployment */ }
  await loadSession();
  await route();
})();
