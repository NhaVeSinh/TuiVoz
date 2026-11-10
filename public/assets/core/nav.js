// Navigation helpers. The router registers itself here so views can navigate without importing it.

// The app sets scroll position itself; the browser's restoration would override it.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

let routeHandler = () => {};
// Set by a view that positions the page itself (a `#post-…` target), so the reset below does not undo it.
let keepScroll = false;

// Scroll position per history entry. Entries are identified by a key stamped into `history.state`, because the
// URL is not unique (a page can be pushed twice) and `history.state` is the only per-entry storage the platform
// gives. Back/forward then restores the list position the reader left, instead of dumping them at the top.
const scrollPositions = new Map();

function stampKey(create) {
  const state = history.state;
  if (state && typeof state.key === 'string') return state.key;
  if (!create) return null;
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  history.replaceState({ ...(state || {}), key }, '');
  return key;
}

// Called before leaving an entry: remembers where the reader was on it.
export function saveScroll() {
  const key = stampKey(true);
  if (key) scrollPositions.set(key, window.scrollY);
}

// Called after a popstate render. Images and lazily-filled strips can still grow the page, so a single
// `scrollTo` would land short; retry on the next frames until the position sticks.
export function restoreScroll() {
  // A `#post-...` / `#conversation-message-...` entry belongs to the post, not to a remembered offset: the view
  // already jumped to the anchor (and called keepCurrentScroll), so restoring the old offset would undo it.
  const hash = location.hash.slice(1);
  if ((hash.startsWith('post-') || hash.startsWith('conversation-message-')) && document.getElementById(hash)) return;
  const key = stampKey(false);
  const top = (key && scrollPositions.get(key)) || 0;
  if (!top) {
    window.scrollTo({ top: 0 });
    return;
  }
  let attempts = 0;
  const apply = () => {
    window.scrollTo({ top });
    attempts += 1;
    if (attempts < 6 && Math.abs(window.scrollY - top) > 2) requestAnimationFrame(apply);
  };
  apply();
}

export function setRouteHandler(fn) {
  routeHandler = fn;
}

// A view that jumped to a specific post after rendering owns the scroll position for this navigation.
export function keepCurrentScroll() {
  keepScroll = true;
}

// History-API routing: /t/845346, not /#/t/845346.
export function navigate(path, { replace = false } = {}) {
  // The outgoing entry keeps its own position, so going back to it lands where it was left.
  saveScroll();
  // Replacing keeps any existing state; a fresh key is stamped right after for the new entry.
  if (replace) history.replaceState({ ...(history.state || {}) }, '', path);
  else history.pushState({}, '', path);
  stampKey(true);
  // Reset the scroll after the view is in the DOM, never before: resetting first made the old page jump to the
  // top and stay there for the whole request, which reads as "the page jumped, then the thread appeared". The
  // view's `innerHTML` write and this microtask both run before the next paint, so no frame shows the new page
  // mid-scroll.
  return Promise.resolve(routeHandler()).finally(() => {
    if (keepScroll) {
      keepScroll = false;
      // The view placed itself (a post permalink); record that position for this entry too.
      saveScroll();
      return;
    }
    window.scrollTo({ top: 0 });
  });
}

export function currentPage() {
  const params = new URLSearchParams(location.search);
  const page = params.get('page');
  if (!page) return 1;
  if (page === 'last') return 'last';
  return Number(page) || 1;
}
