// Links inside post bodies: absolute voz.vn links are rewritten to local paths so the reader stays. Paths this
// app has no route for (…/ignore, …/report, attachments) stay on voz.vn.

export const VOZ_ORIGIN = 'https://voz.vn';

// Path prefixes the local router understands; anything else stays on voz.vn.
//   /t/ thread  /f/ forum  /s/ search-forum  /u/ member  /p/ post  /search  /new
const LOCAL_PREFIXES = ['/t/', '/f/', '/s/', '/u/', '/p/', '/search', '/new'];

// Web-only XenForo routes (they need a cookie session and _xfToken, which this app never has). Keep them on
// voz.vn instead of routing into a 404.
const VOZ_ONLY_SUFFIXES = ['/ignore', '/unignore', '/report', '/warn', '/follow', '/unfollow'];

export function isVozUrl(value) {
  try {
    return new URL(value, VOZ_ORIGIN).origin === VOZ_ORIGIN;
  } catch {
    return false;
  }
}

// "https://voz.vn/t/a.1/" → "/t/a.1/". Null when the link should stay absolute.
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

// Rewrites every <a href> this app serves. Returns the number of links changed, for tests.
export function rewriteVozLinks(root) {
  let changed = 0;
  for (const anchor of root.querySelectorAll('a[href]')) {
    const local = localPathFor(anchor.getAttribute('href'));
    if (!local) continue;
    anchor.setAttribute('href', local);
    // In-app navigation: no new tab, keep link--internal styling.
    anchor.removeAttribute('target');
    anchor.setAttribute('rel', 'nofollow ugc');
    anchor.classList.add('link--internal');
    changed += 1;
  }
  return changed;
}
