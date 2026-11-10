// Navigation helpers. The router registers itself here so views can navigate without importing it.

// The app sets scroll position itself; the browser's restoration would override it.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

let routeHandler = () => {};

export function setRouteHandler(fn) {
  routeHandler = fn;
}

// History-API routing: /t/845346, not /#/t/845346.
export function navigate(path, { replace = false } = {}) {
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  window.scrollTo({ top: 0 });
  routeHandler();
}

export function currentPage() {
  const params = new URLSearchParams(location.search);
  const page = params.get('page');
  if (!page) return 1;
  if (page === 'last') return 'last';
  return Number(page) || 1;
}
