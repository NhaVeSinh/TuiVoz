// Entry point: wires global listeners and boots the router. All data comes from /api/xf/* (edge proxy), so the
// guest key and the OAuth bearer token never reach the browser.

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

// Applied before the first paint so the page never flashes the wrong scheme; the saved preference is in
// localStorage, so it is available synchronously.
wireTheme();

// Intercept same-origin link clicks so navigation never reloads the page.
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
  // Same page, only a #post-… fragment: scroll in place, no re-render. Anchored at the post's top: a voice
  // post can be several screens tall, and `center` dropped the reader into its middle.
  if (url.pathname === location.pathname && url.search === location.search && url.hash) {
    const target = document.getElementById(url.hash.slice(1));
    if (target) {
      event.preventDefault();
      // A filtered-hidden post anchors on its placeholder; show the content before landing on it.
      revealFilteredBlock(target);
      target.scrollIntoView({ block: 'start' });
      // Keep `history.state`: the scroll-position bookkeeping stamps a key into it, and `replaceState({})` wiped
      // that key, so going back to this entry could not find its remembered offset.
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
// voz.vn's markup carries data-onerror="hide-parent" on unfurl favicons; without a listener a dead favicon
// keeps its box and alt text.
wireImageFallbacks();
wireImageDownloads();
wireStaticAvatars();
wirePostScreenshots();
wireAllQuoteExpansion();
wireLightbox();
wireFilteredReveals();

// Back/forward restores the scroll position the reader left on that history entry; `scrollRestoration` is
// manual, so the browser cannot do it.
window.addEventListener('popstate', async () => {
  await route();
  restoreScroll();
});

// "Hiện thị số liệu không rút gọn" changes how numbers and dates are formatted, and those strings are baked
// into the markup, so the current route is re-run in place.
window.addEventListener('voz:format-change', async () => {
  if (location.pathname.startsWith('/cai-dat-tuivoz')) return;
  const top = window.scrollY;
  await route();
  window.scrollTo({ top });
});

// "Hiển thị thành viên bị ban" is decided while rendering. Turning it on (or switching between smart/all)
// needs a redraw so the wiring runs again; turning it off only has to drop the strikethroughs already on screen.
// The import path must be absolute: a relative specifier inside a listener resolves against the current page URL,
// and `window` is the dispatch target because CustomEvent does not bubble from `document`.
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
  // Legacy hash URLs (#/t/123) are rewritten to the path form.
  if (location.hash.startsWith('#/')) {
    history.replaceState({ ...(history.state || {}) }, '', location.hash.slice(1));
  }
  // /voz/app-config advertises a maintenance gate; a 404 means the custom router is not deployed — tolerate it.
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
