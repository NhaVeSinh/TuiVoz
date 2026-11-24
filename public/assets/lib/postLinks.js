/** Local voz.vn links. */

export const VOZ_ORIGIN = 'https://voz.vn';

// Path prefixes the local router understands; anything else stays on voz.vn.
const LOCAL_PREFIXES = ['/t/', '/f/', '/s/', '/u/', '/p/', '/search', '/new'];

// Web-only XenForo routes need cookie + _xfToken; keep them on voz.vn, not a 404.
const VOZ_ONLY_SUFFIXES = ['/ignore', '/unignore', '/report', '/warn', '/follow', '/unfollow'];

export function isVozUrl(value) {
  try {
    return new URL(value, VOZ_ORIGIN).origin === VOZ_ORIGIN;
  } catch {
    return false;
  }
}

// "https://voz.vn/t/a.1/" → "/t/a.1/"; null when the link stays absolute.
export function localPathFor(value) {
  let url;
  try {
    url = new URL(value, VOZ_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== VOZ_ORIGIN) return null;
  const path = url.pathname;
  if (VOZ_ONLY_SUFFIXES.some((suffix) => path.endsWith(suffix))) return null;
  if (!LOCAL_PREFIXES.some((prefix) => path.startsWith(prefix))) return null;
  return `${path}${url.search}${url.hash}`;
}

// Rewrite every <a href>; returns the count changed (used by tests).
export function rewriteVozLinks(root) {
  let changed = 0;
  for (const anchor of root.querySelectorAll('a[href]')) {
    const local = localPathFor(anchor.getAttribute('href'));
    if (!local) continue;
    anchor.setAttribute('href', local);
    // In-app navigation: no new tab.
    anchor.removeAttribute('target');
    anchor.setAttribute('rel', 'nofollow ugc');
    anchor.classList.add('link--internal');
    changed += 1;
  }
  return changed;
}
