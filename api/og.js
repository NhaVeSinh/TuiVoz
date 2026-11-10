// Server-rendered Open Graph tags for link previews (Facebook, Telegram, Zalo, Discord, X...).
//
// The app is a client-rendered SPA: every HTML route is rewritten to /index.html, so crawlers — which never run
// JS — only ever saw the static `<title>VOZ</title>` and the generic description, producing a bare preview.
//
// vercel.json sends crawler requests for thread/forum/user pages here. This function resolves the route against
// the voz.vn API with the guest key (no user session: a crawler has none), injects the matching `og:*` /
// `twitter:*` tags into the SPA shell, and returns the still-bootable `index.html`. The browser then hydrates the
// SPA and the router reads the unchanged `location.pathname`, so a human sees the real page and a crawler sees
// real meta. Non-published paths (and lookup failures) return the untouched shell.

export const config = {
  runtime: 'edge',
  regions: ['sin1'],
};

const SITE = 'https://voz.vn';
const API_BASE = `${SITE}/api`;
const GUEST_KEY = '5tYQHu6ETKPFQ4W-fQGd_78ttL1LyZpD';
const UA = 'VOZ/MA26';
const SITE_NAME = 'VOZ';
const DEFAULT_DESCRIPTION = 'Voz của tui, xài voz theo cách của tui';
const OG_LOCALE = 'vi_VN';
// The branded share card, exactly as voz.vn uses (Styles/voz-*/voz-share-1200x630.png) rather than the post's
// first image: a thread's attachment URL is Cloudflare-protected and only 301s, so crawlers often cannot fetch
// it, and a stable card previews reliably on every platform.
const SHARE_IMAGE_PATH = '/assets/img/og-share-1200x630.png';
const SHARE_IMAGE_WIDTH = 1200;
const SHARE_IMAGE_HEIGHT = 630;

// Numeric id from "<slug>.<id>" or "<id>" — mirrors idFromSegment() in public/assets/core/paths.js.
function idFromSegment(segment) {
  const raw = String(segment || '');
  const tail = raw.includes('.') ? raw.slice(raw.lastIndexOf('.') + 1) : raw;
  return Number(tail) || 0;
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Plain text from a post's parsed HTML: tags dropped, entities decoded, whitespace collapsed.
function toText(html, limit = 300) {
  const text = String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|blockquote|li)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).trim()}…`;
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json', 'XF-Api-Key': GUEST_KEY, 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res.json();
}

// Absolute URL for the SPA shell, fetched from the same deployment so the tags are injected into the real HTML.
function shellUrl(request) {
  return new URL('/index.html', new URL(request.url).origin).toString();
}

// Resolve a route to its preview metadata. Returns null when the path is not one we publish (the caller then
// serves the untouched shell).
async function preview(pathname, origin) {
  const segments = pathname.split('/').filter(Boolean);
  const head = segments[0];
  const self = `${origin}${pathname}`;

  if (head === 't') {
    const threadId = idFromSegment(segments[1]);
    if (!threadId) return null;
    const data = await apiGet(`/threads/${threadId}/?with_posts=true`);
    const thread = data.thread || {};
    const first = (data.posts || [])[0] || {};
    const description = toText(first.message_parsed, 220) || thread.title || '';
    return {
      title: `${thread.title} | ${SITE_NAME}`,
      description: description || DEFAULT_DESCRIPTION,
      type: 'article',
      url: self,
    };
  }

  if (head === 'f' || head === 's') {
    const forumId = idFromSegment(segments[1]);
    if (!forumId) return null;
    const data = head === 'f' ? await apiGet(`/forums/${forumId}/`) : await apiGet(`/search-forums/${forumId}/`);
    const node = data.forum || data.node || {};
    return {
      title: `${node.title} | ${SITE_NAME}`,
      description: toText(node.description, 220) || DEFAULT_DESCRIPTION,
      type: 'website',
      url: self,
    };
  }

  if (head === 'u') {
    const userId = idFromSegment(segments[1]);
    if (!userId) return null;
    const data = await apiGet(`/users/${userId}/`);
    const user = data.user || {};
    const bits = [user.user_title, user.location].filter(Boolean).join(' · ');
    return {
      title: `${user.username} | ${SITE_NAME}`,
      description: bits || DEFAULT_DESCRIPTION,
      type: 'profile',
      url: self,
    };
  }

  return null;
}

function metaTags(meta, origin) {
  const image = `${origin}${SHARE_IMAGE_PATH}`;
  const tags = [
    ['og:site_name', SITE_NAME],
    ['og:locale', OG_LOCALE],
    ['og:type', meta.type],
    ['og:title', meta.title],
    ['og:description', meta.description],
    ['og:url', meta.url],
    ['og:image', image],
    ['og:image:width', String(SHARE_IMAGE_WIDTH)],
    ['og:image:height', String(SHARE_IMAGE_HEIGHT)],
    ['og:image:alt', meta.title],
    ['twitter:card', 'summary_large_image'],
    ['twitter:title', meta.title],
    ['twitter:description', meta.description],
    ['twitter:image', image],
  ];
  return tags
    .map(([property, content]) => {
      const attr = property.startsWith('twitter:') ? 'name' : 'property';
      return `<meta ${attr}="${property}" content="${esc(content)}">`;
    })
    .join('\n');
}

function inject(html, meta, origin) {
  const title = `<title>${esc(meta.title)}</title>`;
  let out = html
    .replace(/<title>[\s\S]*?<\/title>/i, title)
    .replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${esc(meta.description)}">`);
  out = out.replace('</head>', `<!--og-->\n${metaTags(meta, origin)}\n</head>`);
  out = out.replace('</head>', `<link rel="canonical" href="${esc(meta.url)}">\n</head>`);
  return out;
}

export default async function handler(request) {
  const url = new URL(request.url);
  // vercel.json rewrites here as /api/og?__path=<rest>; rebuild the original path.
  if (url.searchParams.has('__path')) {
    const rest = url.searchParams.get('__path') || '';
    url.searchParams.delete('__path');
    url.pathname = '/' + rest.replace(/^\/+/, '');
  }

  let shell = '';
  try {
    const res = await fetch(shellUrl(request), { headers: { 'User-Agent': UA } });
    shell = await res.text();
  } catch {
    return new Response('', { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  let meta = null;
  try {
    meta = await preview(url.pathname, url.origin);
  } catch {
    // Unknown/failed lookup still returns a bootable SPA; the crawler falls back to the static tags.
    meta = null;
  }

  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    // The response differs by User-Agent (crawler vs browser), so caches must key on it.
    Vary: 'User-Agent',
    // Meta is stable for a thread/forum; a short shared cache cuts upstream calls from crawler storms. A failure
    // is cached only briefly so a transient upstream error self-heals.
    'Cache-Control': meta ? 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400' : 'public, max-age=60',
  });

  if (!meta) return new Response(shell, { status: 200, headers });
  return new Response(inject(shell, meta, url.origin), { status: 200, headers });
}
