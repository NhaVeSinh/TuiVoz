// Entry point: wires global listeners and boots the router. All data comes from /api/xf/* (edge proxy), so the
// guest key and the OAuth bearer token never reach the browser.

import { navigate } from './core/nav.js';
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
      target.scrollIntoView({ block: 'start' });
      history.replaceState({}, '', url.pathname + url.search + url.hash);
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

window.addEventListener('popstate', async () => {
  await route();
  window.scrollTo({ top: 0 });
});

// "Hiện thị số liệu không rút gọn" changes how numbers and dates are formatted, and those strings are baked
// into the markup, so the current route is re-run in place.
window.addEventListener('voz:format-change', async () => {
  if (location.pathname.startsWith('/cai-dat-tuivoz')) return;
  const top = window.scrollY;
  await route();
  window.scrollTo({ top });
});

(async function boot() {
  // Legacy hash URLs (#/t/123) are rewritten to the path form.
  if (location.hash.startsWith('#/')) {
    history.replaceState({}, '', location.hash.slice(1));
  }
  await loadSession();
  await route();
})();
