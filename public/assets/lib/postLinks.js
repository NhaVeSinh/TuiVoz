/** Local voz.vn links. */

export const VOZ_ORIGIN = 'https://voz.vn';

// Path prefixes the local router understands; anything else stays on voz.vn.
const LOCAL_PREFIXES = ['/t/', '/f/', '/s/', '/u/', '/p/', '/search', '/new'];

// Web-only XenForo routes; the SPA has no local route — keep them for /forum/.
const VOZ_ONLY_SUFFIXES = ['/ignore', '/unignore', '/report', '/warn', '/follow', '/unfollow'];

export function isVozUrl(value) {
  try {
    return new URL(value, VOZ_ORIGIN).origin === VOZ_ORIGIN;
  } catch {
    return false;
  }
}

// "https://voz.vn/t/a.1/" → "/t/a.1/"; null when the link has no local route.
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

// Non-local voz.vn paths go through /forum/ (proxied, keeps xf session —
// routes like /report, /account work there even on voz-blocked networks).
export function forumPathFor(value) {
  let url;
  try {
    url = new URL(value, VOZ_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== VOZ_ORIGIN) return null;
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('#') || raw.startsWith('?')) return null;
  return `/forum${url.pathname}${url.search}${url.hash}`;
}

// Rewrite every <a href>; returns the count changed (used by tests).
export function rewriteVozLinks(root) {
  let changed = 0;
  for (const anchor of root.querySelectorAll('a[href]')) {
    const local = localPathFor(anchor.getAttribute('href'));
    if (local) {
      anchor.setAttribute('href', local);
      // In-app navigation: no new tab.
      anchor.removeAttribute('target');
      anchor.setAttribute('rel', 'nofollow ugc');
      anchor.classList.add('link--internal');
      changed += 1;
      continue;
    }
    const forum = forumPathFor(anchor.getAttribute('href'));
    if (!forum) continue;
    anchor.setAttribute('href', forum);
    anchor.setAttribute('rel', 'ugc noopener');
    changed += 1;
  }
  return changed;
}
