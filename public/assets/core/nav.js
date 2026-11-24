/** Navigation + scroll restore. */

// App owns scroll; browser restoration would override it.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

let routeHandler = () => {};
// Set when a view positioned the page itself (a #post target).
let keepScroll = false;
// Set when a nested navigate already placed the scroll.
let placedByNestedNavigate = false;

// Scroll per history entry, keyed by a stamp in history.state (URLs aren't unique).
const scrollPositions = new Map();

function stampKey(create) {
  const state = history.state;
  if (state && typeof state.key === 'string') return state.key;
  if (!create) return null;
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  history.replaceState({ ...(state || {}), key }, '');
  return key;
}

// Remembers where the reader was before leaving an entry.
export function saveScroll() {
  const key = stampKey(true);
  if (key) scrollPositions.set(key, window.scrollY);
}

// After popstate render; retries frames until late-loading content settles.
export function restoreScroll() {
  // #post/#conversation-message anchors own the scroll; don't restore the offset.
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

// A view that jumped to a post owns this navigation's scroll.
export function keepCurrentScroll() {
  keepScroll = true;
}

// History-API routing: /t/845346, not #/t/845346.
export function navigate(path, { replace = false } = {}) {
  // Save the outgoing entry's position so back lands where it was left.
  saveScroll();
  // Replace keeps existing state; a fresh key is stamped next.
  if (replace) history.replaceState({ ...(history.state || {}) }, '', path);
  else history.pushState({}, '', path);
  stampKey(true);
  // Reset scroll only after the view is in the DOM (pre-paint microtask).
  return Promise.resolve(routeHandler()).finally(() => {
    if (keepScroll) {
      keepScroll = false;
      // View placed itself (post permalink); record that position too.
      saveScroll();
      // Enclosing navigate must not reset the scroll just set.
      placedByNestedNavigate = true;
      return;
    }
    // Nested navigate already placed the view; resetting would undo it.
    if (placedByNestedNavigate) {
      placedByNestedNavigate = false;
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
