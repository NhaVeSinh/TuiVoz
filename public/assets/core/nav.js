// Navigation helpers. The router registers itself here so views can navigate without importing it.

// The app sets scroll position itself; the browser's restoration would override it.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

let routeHandler = () => {};
// Set by a view that positions the page itself (a `#post-…` target), so the reset below does not undo it.
let keepScroll = false;

export function setRouteHandler(fn) {
  routeHandler = fn;
}

// A view that jumped to a specific post after rendering owns the scroll position for this navigation.
export function keepCurrentScroll() {
  keepScroll = true;
}

// History-API routing: /t/845346, not /#/t/845346.
export function navigate(path, { replace = false } = {}) {
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  // Reset the scroll after the view is in the DOM, never before: resetting first made the old page jump to the
  // top and stay there for the whole request, which reads as "the page jumped, then the thread appeared". The
  // view's `innerHTML` write and this microtask both run before the next paint, so no frame shows the new page
  // mid-scroll.
  return Promise.resolve(routeHandler()).finally(() => {
    if (keepScroll) {
      keepScroll = false;
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
