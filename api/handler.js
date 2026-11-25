/** voz.vn edge API proxy + OAuth2. */

export const config = {
  runtime: 'edge',
  regions: ['sin1'],
};

const SITE = 'https://voz.vn';
const API_BASE = `${SITE}/api`;
const GUEST_KEY = '5tYQHu6ETKPFQ4W-fQGd_78ttL1LyZpD';
const CLIENT_ID = '2424906941304717';
// imgur Client-ID for the sticker importer; fixed server-side.
const IMGBUR_CLIENT_ID = '66850c248e91c93';
const REDIRECT_URI = 'vozma26://oauth';
const UA = 'VOZ/MA26';
// All scopes the official app requests; new ones need re-login.
const SCOPES = [
  'thread:read',
  'thread:write',
  'node:read',
  'alert:read',
  'conversation:read',
  'conversation:write',
  'user:read',
  'user:write',
  'profile_post:read',
  'search:read',
  'search:write',
  'attachment:read',
  'attachment:write',
  'attachment:delete',
].join(' ');

const SESSION_COOKIE = 'voz_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

// Server-side image cache: avatars are immutable per URL, avoids re-hitting data.voz.vn.
const IMAGE_CACHE = new Map();
const IMAGE_CACHE_TTL = 6 * 60 * 60 * 1000; // 6h
const IMAGE_CACHE_MAX = 500;

// Server-side oEmbed targets for [MEDIA=<site>] embeds.
const OEMBED_TARGETS = {
  flickr: (key) => `https://www.flickr.com/services/oembed/?url=${encodeURIComponent(`https://flic.kr/p/${key}`)}&format=json`,
};

// Douyin share links: the aweme id hides behind redirects; no CORS.
const DOUYIN_SHORT_HOSTS = ['v.douyin.com'];
const DOUYIN_MEDIA_HOSTS = ['www.douyin.com', 'douyin.com', 'www.iesdouyin.com', 'iesdouyin.com'];
const DOUYIN_VIDEO_ID = /\/(?:share\/)?video\/(\d{6,25})(?:[/?#]|$)/;
const DOUYIN_SHORT_CODE = /^\/[\w-]{4,32}\/?$/;
const DOUYIN_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// Returns the aweme id from a share URL or bare numeric id.
async function resolveDouyinVideoId(raw) {
  if (/^\d{6,25}$/.test(raw)) return raw;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const direct = url.pathname.match(DOUYIN_VIDEO_ID);
  if (DOUYIN_MEDIA_HOSTS.includes(url.hostname) && direct) return direct[1];
  if (!DOUYIN_SHORT_HOSTS.includes(url.hostname) || !DOUYIN_SHORT_CODE.test(url.pathname)) return null;
  // redirect:'manual' isn't portable, so hops are walked and capped.
  let next = url.href;
  for (let hop = 0; hop < 4; hop++) {
    let res;
    try {
      res = await fetch(next, { headers: { 'User-Agent': DOUYIN_UA, Accept: 'text/html,*/*' }, redirect: 'manual' });
    } catch {
      return null;
    }
    const location = res.headers.get('location');
    if (location) {
      try {
        next = new URL(location, next).href;
      } catch {
        return null;
      }
      const match = next.match(DOUYIN_VIDEO_ID);
      if (match) return match[1];
      continue;
    }
    if (!res.ok) return null;
    // Some links serve HTML instead of redirecting; id is inside.
    const html = (await res.text()).slice(0, 200_000);
    const match = html.match(/"aweme_id"\s*:\s*"(\d{6,25})"/) || html.match(DOUYIN_VIDEO_ID);
    return match ? match[1] : null;
  }
  return null;
}

const encoder = new TextEncoder();

function b64uEncode(str) {
  const bytes = encoder.encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDecode(str) {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function getCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

function sessionCookie(tokens, maxAge = SESSION_MAX_AGE) {
  const value = tokens ? b64uEncode(JSON.stringify(tokens)) : '';
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function readSession(request) {
  const raw = getCookie(request, SESSION_COOKIE);
  if (!raw) return null;
  try {
    const tokens = JSON.parse(b64uDecode(raw));
    return tokens && tokens.accessToken ? tokens : null;
  } catch {
    return null;
  }
}

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function corsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  // ACAO only when origin is the request host, the site itself, or localhost.
  let originUrl = null;
  try {
    originUrl = origin ? new URL(origin) : null;
  } catch {
    originUrl = null;
  }
  const sameHost = originUrl !== null
    && (originUrl.protocol === 'https:' || originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1')
    && originUrl.host === request.headers.get('host');
  const allowed = origin === SITE || sameHost
    || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : SITE,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function normaliseTokenResponse(payload, previous) {
  if (!payload || !payload.access_token) return null;
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || (previous && previous.refreshToken) || '',
    expiresAt: Date.now() + (Number(payload.expires_in) || 3600) * 1000,
    scope: payload.scope || (previous && previous.scope) || SCOPES,
    tokenType: payload.token_type || 'Bearer',
    obtainedAt: new Date().toISOString(),
  };
}

async function tokenRequest(params) {
  const res = await fetch(`${API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
      Accept: 'application/json',
    },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  return { ok: res.ok, status: res.status, payload, text };
}

async function exchangeCode(code, verifier) {
  const { ok, status, payload, text } = await tokenRequest({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code,
    code_verifier: verifier,
    redirect_uri: REDIRECT_URI,
  });
  if (!ok) return { error: 'exchange_failed', status, detail: text.slice(0, 400) };
  const tokens = normaliseTokenResponse(payload);
  if (!tokens) return { error: 'exchange_failed', status, detail: text.slice(0, 400) };
  return { tokens };
}

async function refreshTokens(tokens) {
  if (!tokens || !tokens.refreshToken) return null;
  const { ok, payload } = await tokenRequest({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    refresh_token: tokens.refreshToken,
  });
  if (!ok) return null;
  return normaliseTokenResponse(payload, tokens);
}

async function fetchMe(tokens) {
  const headers = { 'User-Agent': UA, Accept: 'application/json' };
  if (tokens && tokens.accessToken) headers.Authorization = `Bearer ${tokens.accessToken}`;
  else headers['XF-Api-Key'] = GUEST_KEY;
  const res = await fetch(`${API_BASE}/me/`, { headers });
  if (!res.ok) return null;
  const data = await res.json();
  return data.me || null;
}

// No /reactions proxy: Cloudflare blocks server-side fetch; browser scrapes it.

// Full-page voz.vn proxy under /forum/: carries xf_session for login + push subscribe.
// Browser hits /forum/<x> which vercel maps to /api/forum/<x>; rewrites use visible /forum/.
const FORUM_VISIBLE_PREFIX = '/forum';

async function handleForumProxy(request, url) {
  const proxyOrigin = url.origin;
  const proxyHost = url.host;
  const sub = url.pathname.replace(/^\/api\/forum/, '') || '/';
  const targetUrl = new URL(sub + url.search, SITE);

  const newHeaders = new Headers(request.headers);
  newHeaders.set('Host', 'voz.vn');
  newHeaders.set('Origin', SITE);
  const referer = request.headers.get('referer');
  if (referer) {
    newHeaders.set('Referer', referer.replace(proxyOrigin + FORUM_VISIBLE_PREFIX, SITE).replace(proxyOrigin, SITE));
  } else {
    newHeaders.set('Referer', `${SITE}${sub}`);
  }
  // Drop cookies that aren't voz.vn's (e.g. our voz_session) before forwarding.
  const cookie = (request.headers.get('cookie') || '')
    .split(';')
    .map((c) => c.trim())
    .filter((c) => c && !c.startsWith(`${SESSION_COOKIE}=`))
    .join('; ');
  if (cookie) newHeaders.set('Cookie', cookie);
  else newHeaders.delete('Cookie');
  for (const h of ['x-forwarded-for', 'x-real-ip', 'x-vercel-ip-country', 'x-vercel-forwarded-for', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'accept-encoding']) {
    newHeaders.delete(h);
  }

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  let upstream;
  try {
    // duplex:half required by Node fetch when forwarding a stream body.
    upstream = await fetch(new Request(targetUrl.toString(), {
      method: request.method,
      headers: newHeaders,
      body: hasBody ? request.body : null,
      ...(hasBody ? { duplex: 'half' } : {}),
      redirect: 'manual',
    }));
  } catch (err) {
    return new Response(`Forum proxy error: ${err.message}`, { status: 502 });
  }
  // Read before wrapping: getSetCookie keeps each cookie intact.
  const setCookies = typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : [];

  const headers = new Headers(upstream.headers);
  // Authenticated pages must never be shared-cached.
  headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate, max-age=0');
  headers.set('CDN-Cache-Control', 'no-store');
  headers.set('Vercel-CDN-Cache-Control', 'no-store');
  headers.delete('Age');
  headers.delete('Expires');
  headers.delete('x-frame-options');
  headers.delete('content-security-policy');
  headers.delete('content-security-policy-report-only');

  const location = headers.get('Location');
  if (location) {
    let loc = location;
    try {
      const u = new URL(location, SITE);
      if (u.protocol === 'vozma26:') {
        // OAuth callback: the custom scheme can't reach the SPA — hand it the code.
        loc = proxyOrigin + '/oauth-callback' + u.search + u.hash;
      } else if (u.host === 'voz.vn') {
        loc = proxyOrigin + FORUM_VISIBLE_PREFIX + u.pathname + u.search + u.hash;
      }
    } catch {
      loc = location.replace(SITE, proxyOrigin + FORUM_VISIBLE_PREFIX);
    }
    headers.set('Location', loc);
  }

  // Rebind cookies to this origin (xf_session, xf_user, xf_csrf).
  if (setCookies.length) {
    headers.delete('Set-Cookie');
    for (const c of setCookies) {
      headers.append('Set-Cookie', c.replace(/Domain=[^;]+;?/gi, ''));
    }
  }

  const contentType = headers.get('Content-Type') || '';
  const isText = /text\/html|application\/(json|javascript)|text\/javascript/.test(contentType);
  if (!isText || upstream.status === 204 || upstream.status === 304) {
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
  }

  headers.delete('Content-Encoding');
  headers.delete('Content-Length');
  let bodyText = await upstream.text();
  bodyText = bodyText
    .replaceAll(SITE, proxyOrigin + FORUM_VISIBLE_PREFIX)
    .replaceAll(`//voz.vn`, `//${proxyHost}${FORUM_VISIBLE_PREFIX}`);
  if (contentType.includes('text/html')) {
    bodyText = bodyText
      // Base tag fixes relative URLs (index.php?…, css/xf/…); root-relative need rewrites.
      .replace(/<head(\s[^>]*)?>/i, `<head$1><base href="${proxyOrigin}${FORUM_VISIBLE_PREFIX}/">`)
      .replace(/((?:src|href|action|formaction|poster|data-src|data-url)\s*=\s*["'])\/(?!\/|forum\/)/gi, `$1${FORUM_VISIBLE_PREFIX}/`)
      .replace(/(\bsrcset\s*=\s*["'])([^"']*)(["'])/gi, (m, pre, list, post) =>
        pre + list.replace(/(^|,)\s*\/(?!\/|forum\/)/g, `$1${FORUM_VISIBLE_PREFIX}/`) + post)
    // XF JS builds URLs off XF.config — rewrite every root-relative string inside
    // each `XF.config = {...}` object (basePath, all url.* templates: css/js/icon/
    // iconInline/keepAlive/alert/iconBadge/contentTitle, escaped-slash js/css map
    // keys, cookie path). Keys are nested ("url":{"css":…}) so a key whitelist
    // can't reach them; brace-match the object instead. `/local://` is XF's own
    // "relative to boardUrl" marker — leave it. fullBase is absolute, covered by
    // the SITE replaceAll above.
    {
      const configRe = /XF\.config\s*=\s*\{/g;
      let rebuilt = '';
      let lastIndex = 0;
      let match;
      while ((match = configRe.exec(bodyText))) {
        const objStart = match.index + match[0].length - 1;
        let depth = 0;
        let quote = null;
        let escaped = false;
        let end = objStart;
        for (; end < bodyText.length; end++) {
          const ch = bodyText[end];
          if (quote) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === quote) quote = null;
            continue;
          }
          if (ch === '"' || ch === "'") quote = ch;
          else if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (!depth) { end++; break; }
          }
        }
        rebuilt += bodyText.slice(lastIndex, objStart)
          + bodyText.slice(objStart, end)
            .replace(/(['"])\/(?!\/|forum\/|local:)/g, `$1${FORUM_VISIBLE_PREFIX}/`)
            .replace(/(["{,]\s*["'])\\\/(?!forum\\\/)/g, `$1\\/forum\\/`);
        lastIndex = end;
        configRe.lastIndex = end;
      }
      bodyText = rebuilt + bodyText.slice(lastIndex);
    }
  }
  return new Response(bodyText, { status: upstream.status, statusText: upstream.statusText, headers });
}

// Cacheable GET tiers: /voz/* pass through ETag/max-age; rest no-store.
function cacheControlFor(method, sub, upstreamHeaders, headers) {
  if (method !== 'GET') return 'private, no-store, max-age=0';
  if (sub.startsWith('/voz/reactions') || sub.startsWith('/voz/smilies') || sub.startsWith('/voz/app-config')) {
    // Pass ETag/max-age through but force private: xf-request-user is per-user.
    const etag = upstreamHeaders.get('etag');
    if (etag) headers.set('ETag', etag);
    const maxAge = /max-age=(\d+)/.exec(upstreamHeaders.get('cache-control') || '')?.[1]
      || (sub.startsWith('/voz/app-config') ? '60' : '3600');
    return `private, max-age=${maxAge}`;
  }
  // All else no-store: voz.vn sends no entity ETags.
  return 'private, no-store, max-age=0';
}

async function handleProxy(request, url, tokens) {
  const sub = url.pathname.replace(/^\/api\/xf/, '') || '/';
  const target = `${API_BASE}${sub}${url.search}`;

  const method = request.method.toUpperCase();
  const hasBody = !['GET', 'HEAD'].includes(method);
  const bodyBuffer = hasBody ? await request.arrayBuffer() : null;

  const buildHeaders = (activeTokens) => {
    const headers = new Headers();
    headers.set('User-Agent', UA);
    headers.set('Accept', 'application/json');
    const contentType = request.headers.get('content-type');
    if (contentType) headers.set('Content-Type', contentType);
    if (activeTokens && activeTokens.accessToken) {
      headers.set('Authorization', `Bearer ${activeTokens.accessToken}`);
    } else {
      headers.set('XF-Api-Key', GUEST_KEY);
    }
    return headers;
  };

  const send = (activeTokens) =>
    fetch(target, {
      method,
      headers: buildHeaders(activeTokens),
      body: bodyBuffer && bodyBuffer.byteLength ? bodyBuffer : undefined,
      redirect: 'manual',
    });

  let activeTokens = tokens;
  let upstream = await send(activeTokens);
  let refreshed = null;

  if (upstream.status === 401 && activeTokens) {
    refreshed = await refreshTokens(activeTokens);
    if (refreshed) {
      activeTokens = refreshed;
      upstream = await send(activeTokens);
    }
  }

  const headers = new Headers();
  headers.set('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
  // Cache tiers apply only to successful upstream responses.
  headers.set('Cache-Control', upstream.ok ? cacheControlFor(method, sub, upstream.headers, headers) : 'private, no-store, max-age=0');
  for (const name of ['xf-request-user', 'xf-request-user-extras']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Sliding session: re-issue the cookie on every authenticated call so the
  // 30-day Max-Age renews like XenForo's rolling session (avoid idle expiry).
  if (refreshed || activeTokens) headers.append('Set-Cookie', sessionCookie(refreshed || activeTokens));

  return new Response(upstream.body, { status: upstream.status, headers });
}

export default async function handler(request) {
  const url = new URL(request.url);
  // vercel.json rewrites /api/* as ?__path=<rest>; rebuild the real path.
  if (url.searchParams.has('__path')) {
    const rest = url.searchParams.get('__path') || '';
    url.searchParams.delete('__path');
    url.pathname = '/api' + (rest ? `/${rest.replace(/^\/+/, '')}` : '');
  }
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (path === '/api/config') {
    return json({
      siteUrl: SITE,
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      scopes: SCOPES,
      authorizeUrl: `${SITE}/oauth2/authorize`,
    });
  }

  // The page can't follow douyin redirects; resolve here.
  if (path === '/api/xf/douyin') {
    const id = await resolveDouyinVideoId(url.searchParams.get('url') || '');
    const headers = new Headers(corsHeaders(request));
    headers.set('Cache-Control', 'private, max-age=86400');
    if (!id) return json({ error: 'douyin_unresolved' }, { status: 404, headers });
    return json({ id, embed: `https://open.douyin.com/player/video?vid=${id}&autoplay=0`, page: `https://www.douyin.com/video/${id}` }, { status: 200, headers });
  }

  // oEmbed providers send no CORS headers; the page relays here.
  if (path === '/api/xf/oembed') {
    const site = (url.searchParams.get('site') || '').toLowerCase();
    const key = url.searchParams.get('key') || '';
    const target = OEMBED_TARGETS[site];
    if (!target || !/^[\w-]{3,32}$/.test(key)) {
      return json({ error: 'unsupported_oembed' }, { status: 400, headers: corsHeaders(request) });
    }
    let upstream;
    try {
      upstream = await fetch(target(key), { headers: { Accept: 'application/json', 'User-Agent': UA } });
    } catch {
      return json({ error: 'oembed_unreachable' }, { status: 502, headers: corsHeaders(request) });
    }
    const text = await upstream.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return json({ error: 'oembed_bad_response' }, { status: 502, headers: corsHeaders(request) });
    }
    const headers = new Headers(corsHeaders(request));
    headers.set('Cache-Control', 'private, max-age=3600');
    // Whitelist fields; the raw payload can carry arbitrary URLs.
    return json(
      {
        provider: String(payload.provider_name || site),
        type: String(payload.type || ''),
        title: String(payload.title || '').slice(0, 300),
        url: String(payload.url || ''),
        thumbnail_url: String(payload.thumbnail_url || ''),
        width: Number(payload.width) || 0,
        height: Number(payload.height) || 0,
        web_page: String(payload.web_page || ''),
      },
      { status: upstream.ok ? 200 : upstream.status, headers }
    );
  }

  // imgur relay (no CORS); Client-ID stays server-side to protect quota.
  if (path.startsWith('/api/xf/imgur/')) {
    const sub = path.replace('/api/xf/imgur', '');
    const upstream = await fetch(`https://api.imgur.com/3${sub}`, {
      headers: { Authorization: `Client-ID ${IMGBUR_CLIENT_ID}`, Accept: 'application/json' },
    });
    const text = await upstream.text();
    const headers = new Headers(corsHeaders(request));
    headers.set('Content-Type', 'application/json');
    headers.set('Cache-Control', 'private, max-age=300');
    if (!upstream.ok) {
      return new Response(JSON.stringify({ success: false, status: upstream.status, error: text.slice(0, 300) }), { status: upstream.status, headers });
    }
    return new Response(text, { status: 200, headers });
  }

  if (path === '/api/image-download' && request.method === 'GET') {
    let target;
    try {
      target = new URL(url.searchParams.get('url') || '');
    } catch {
      return json({ error: 'invalid_image_url' }, { status: 400, headers: corsHeaders(request) });
    }
    if (target.protocol !== 'https:' || target.username || target.password) {
      return json({ error: 'invalid_image_url' }, { status: 400, headers: corsHeaders(request) });
    }
    // limit= fetches only N bytes so the avatar check skips a full download.
    const limit = Number(url.searchParams.get('limit')) || 0;
    const cacheKey = `${target.href}|${limit}`;
    const hit = IMAGE_CACHE.get(cacheKey);
    if (hit && Date.now() - hit.t < IMAGE_CACHE_TTL) {
      const h = new Headers(corsHeaders(request));
      h.set('Content-Type', hit.type);
      h.set('Cache-Control', 'private, max-age=86400');
      h.set('X-Image-Cache', 'hit');
      if (hit.total) h.set('X-Image-Total', hit.total);
      return new Response(hit.body, { status: 200, headers: h });
    }
    // Retry 403/429: a Cloudflare challenge is a 403 HTML page.
    const attempt = () => {
      const headers = { Accept: 'image/*', 'User-Agent': UA };
      if (limit > 0) headers.Range = `bytes=0-${limit - 1}`;
      return fetch(target, { headers, redirect: 'follow' }).catch(() => null);
    };
    let upstream = await attempt();
    for (let tries = 0; tries < 3; tries++) {
      const type = upstream?.headers.get('content-type') || '';
      if (upstream?.ok && type.startsWith('image/')) break;
      if (upstream && upstream.status !== 403 && upstream.status !== 429) break;
      upstream = await attempt();
    }
    const contentType = upstream?.headers.get('content-type') || '';
    if (!upstream?.ok || !contentType.startsWith('image/')) {
      return json({ error: 'image_download_failed' }, { status: upstream?.status || 502, headers: corsHeaders(request) });
    }
    const headers = new Headers(corsHeaders(request));
    headers.set('Content-Type', contentType);
    // ?<mtime> makes bytes immutable; private keeps them per-user.
    headers.set('Cache-Control', 'private, max-age=86400');
    if (limit > 0) {
      // Lets the caller detect a truncated prefix.
      const total = upstream.headers.get('content-range')?.split('/')[1] || upstream.headers.get('content-length') || '';
      if (total) headers.set('X-Image-Total', total);
    }
    // Cache full images (limit= is a sniff probe, not worth storing).
    if (!limit) {
      const body = await upstream.arrayBuffer();
      if (body.byteLength < 512 * 1024) {
        if (IMAGE_CACHE.size >= IMAGE_CACHE_MAX) IMAGE_CACHE.delete(IMAGE_CACHE.keys().next().value);
        IMAGE_CACHE.set(cacheKey, { body, type: contentType, total: headers.get('X-Image-Total') || '', t: Date.now() });
      }
      return new Response(body, { status: 200, headers });
    }
    return new Response(upstream.body, { status: 200, headers });
  }

  // Attachment direct_url 403s without a forum cookie; fetch server-side.
  if (path === '/api/attachment-download' && request.method === 'GET') {
    const id = String(url.searchParams.get('id') || '').replace(/\D/g, '');
    if (!id) return json({ error: 'missing_id' }, { status: 400, headers: corsHeaders(request) });
    const session = readSession(request);
    const metaHeaders = { 'User-Agent': UA, Accept: 'application/json' };
    if (session && session.accessToken) metaHeaders.Authorization = `Bearer ${session.accessToken}`;
    else metaHeaders['XF-Api-Key'] = GUEST_KEY;
    const meta = await fetch(`${API_BASE}/attachments/${id}/`, { headers: metaHeaders }).then((r) => r.ok ? r.json() : null).catch(() => null);
    const attachment = meta?.attachment;
    const target = attachment?.direct_url || attachment?.url;
    if (!target || !/^https:\/\//.test(target)) {
      return json({ error: 'attachment_not_found' }, { status: 404, headers: corsHeaders(request) });
    }
    let upstream;
    for (let tries = 0; tries < 3; tries++) {
      upstream = await fetch(target, {
        headers: { 'User-Agent': UA, Accept: '*/*', Referer: `${SITE}/` },
        redirect: 'follow',
      }).catch(() => null);
      if (upstream?.ok) break;
      if (upstream && upstream.status !== 403 && upstream.status !== 429) break;
    }
    if (!upstream?.ok) {
      return json({ error: 'attachment_download_failed' }, { status: upstream?.status || 502, headers: corsHeaders(request) });
    }
    const filename = attachment.filename || `attachment-${id}`;
    const headers = new Headers(corsHeaders(request));
    headers.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    if (upstream.headers.get('content-length')) headers.set('Content-Length', upstream.headers.get('content-length'));
    // ?name= renders inline; plain ?id= downloads with the real filename.
    const disposition = url.searchParams.get('name') ? 'inline' : 'attachment';
    headers.set('Content-Disposition', `${disposition}; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    headers.set('Cache-Control', 'private, max-age=86400');
    return new Response(upstream.body, { status: 200, headers });
  }

  // pik.vn relay (no CORS); forward the body untouched for its SHA-256 check.
  if (path === '/api/pik/upload' && request.method === 'POST') {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.startsWith('multipart/form-data')) {
      return json({ error: 'Cần multipart/form-data.' }, { status: 400, headers: corsHeaders(request) });
    }
    let upstream;
    try {
      // Buffered: streaming needs non-portable duplex:'half' on edge.
      const body = await request.arrayBuffer();
      upstream = await fetch('https://pik.vn/api/upload', {
        method: 'POST',
        headers: { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': contentType },
        body,
      });
    } catch {
      return json({ error: 'Không kết nối được pik.vn.' }, { status: 502, headers: corsHeaders(request) });
    }
    const text = await upstream.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text.slice(0, 300) || `pik.vn trả về HTTP ${upstream.status}.` };
    }
    const headers = new Headers(corsHeaders(request));
    headers.set('Cache-Control', 'private, no-store, max-age=0');
    return json(payload, { status: upstream.ok && payload.url ? 200 : upstream.status || 502, headers });
  }

  if (path === '/api/oauth/status') {
    const tokens = readSession(request);
    if (!tokens) return json({ loggedIn: false, me: null });
    let active = tokens;
    if (active.expiresAt && active.expiresAt - Date.now() < 60_000) {
      const refreshed = await refreshTokens(active);
      if (refreshed) active = refreshed;
    }
    const me = await fetchMe(active);
    const headers = new Headers();
    // Always re-issue: sliding 30-day expiry, same as the /api/xf proxy path.
    headers.append('Set-Cookie', sessionCookie(active));
    return json({ loggedIn: !!me && me.user_id > 0, me }, { headers });
  }

  if (path === '/api/oauth/exchange' && request.method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid_body' }, { status: 400, headers: corsHeaders(request) });
    }
    const code = (body.code || '').trim();
    const verifier = (body.verifier || '').trim();
    if (!code || !verifier) {
      return json({ error: 'missing_code_or_verifier' }, { status: 400, headers: corsHeaders(request) });
    }
    const result = await exchangeCode(code, verifier);
    if (result.error) {
      return json(result, { status: 400, headers: corsHeaders(request) });
    }
    const me = await fetchMe(result.tokens);
    const headers = new Headers(corsHeaders(request));
    headers.append('Set-Cookie', sessionCookie(result.tokens));
    return json({ ok: true, me }, { headers });
  }

  if (path === '/api/oauth/logout' && request.method === 'POST') {
    const tokens = readSession(request);
    if (tokens && tokens.refreshToken) {
      try {
        await fetch(`${API_BASE}/oauth2/revoke`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': UA,
          },
          body: new URLSearchParams({
            client_id: CLIENT_ID,
            token: tokens.refreshToken,
            token_type_hint: 'refresh_token',
          }),
        });
      } catch {
        // revoke is best-effort; the cookie is cleared regardless
      }
    }
    const headers = new Headers();
    headers.append('Set-Cookie', sessionCookie(null, 0));
    return json({ ok: true }, { headers });
  }

  if (path === '/api/forum' || path.startsWith('/api/forum/')) {
    return handleForumProxy(request, url);
  }

  if (path === '/api/xf' || path.startsWith('/api/xf/')) {
    return handleProxy(request, url, readSession(request));
  }

  return json({ error: 'not_found', path }, { status: 404 });
}
