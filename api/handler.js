// VOZ forum — edge API (Singapore region). Proxies voz.vn/api with the guest key or the user's OAuth bearer
// token, and runs the OAuth2 + PKCE exchange server-side (the token endpoint needs a browser-only User-Agent).

export const config = {
  runtime: 'edge',
  regions: ['sin1'],
};

const SITE = 'https://voz.vn';
const API_BASE = `${SITE}/api`;
const GUEST_KEY = '5tYQHu6ETKPFQ4W-fQGd_78ttL1LyZpD';
const CLIENT_ID = '2424906941304717';
// imgur Client-ID for the sticker-album importer. Fixed, not user-supplied.
const IMGBUR_CLIENT_ID = '66850c248e91c93';
const REDIRECT_URI = 'vozma26://oauth';
const UA = 'VOZ/MA26';
const SCOPES = [
  'thread:read',
  'thread:write',
  'node:read',
  'alert:read',
  'conversation:read',
  'conversation:write',
  'user:read',
  'user:write',
  'search:read',
  'search:write',
  'attachment:read',
].join(' ');

const SESSION_COOKIE = 'voz_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

// oEmbed providers XenForo resolves server-side for [MEDIA=<site>]<key>[/MEDIA].
const OEMBED_TARGETS = {
  flickr: (key) => `https://www.flickr.com/services/oembed/?url=${encodeURIComponent(`https://flic.kr/p/${key}`)}&format=json`,
};

// Douyin (抖音) share links. The player needs the numeric aweme id, which a short v.douyin.com link only reveals
// through its Location header, and douyin.com sends no CORS headers.
const DOUYIN_SHORT_HOSTS = ['v.douyin.com'];
const DOUYIN_MEDIA_HOSTS = ['www.douyin.com', 'douyin.com', 'www.iesdouyin.com', 'iesdouyin.com'];
const DOUYIN_VIDEO_ID = /\/(?:share\/)?video\/(\d{6,25})(?:[/?#]|$)/;
const DOUYIN_SHORT_CODE = /^\/[\w-]{4,32}\/?$/;
const DOUYIN_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// Accepts a full share URL or a bare numeric id and returns the aweme id, or null. Anything not recognisably
// douyin is rejected before a fetch.
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
  // `redirect: 'manual'` is not portable across runtimes, so the hops are walked explicitly and capped.
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
    // Some share links land on a real page instead of redirecting; the id is in the HTML.
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
  const allowed = origin === SITE || origin.endsWith('.vercel.app') || origin.startsWith('http://localhost');
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

// The REST API only exposes reaction counts. The member list lives on /p/{id}/reactions, which Cloudflare
// blocks for server-side fetch, so the browser fetches it and parses here.
function decodeEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function parseReactionList(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = [];
  for (const row of doc.querySelectorAll('.block-row--separated')) {
    const user = row.querySelector('.username[data-user-id]');
    if (!user) continue;
    const reaction = row.querySelector('.reaction[data-reaction-id]');
    const img = row.querySelector('.reaction-image');
    const time = row.querySelector('time');
    rows.push({
      user_id: Number(user.getAttribute('data-user-id')),
      username: user.textContent.trim(),
      reaction_id: reaction ? Number(reaction.getAttribute('data-reaction-id')) : null,
      reaction_title: img ? img.getAttribute('alt') : null,
      date: time ? time.getAttribute('datetime') : null,
    });
  }
  return rows;
}

const reactionCache = new Map();
const REACTION_TTL = 60_000;

async function fetchReactionUsers(postId) {
  const cached = reactionCache.get(postId);
  if (cached && Date.now() - cached.at < REACTION_TTL) return cached.data;
  const res = await fetch(`https://voz.vn/p/${postId}/reactions`, {
    credentials: 'omit',
    headers: { Accept: 'text/html' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const data = { reactions: parseReactionList(html) };
  reactionCache.set(postId, { at: Date.now(), data });
  return data;
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
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  for (const name of ['xf-request-user', 'xf-request-user-extras']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (refreshed) headers.append('Set-Cookie', sessionCookie(refreshed));

  return new Response(upstream.body, { status: upstream.status, headers });
}

export default async function handler(request) {
  const url = new URL(request.url);
  // vercel.json rewrites every /api/* request to this function as /api/handler?__path=<rest>, so the original
  // path is rebuilt here. Catch-all `[...path].js` only works in Next.js.
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

  // Douyin share links: the page needs the aweme id but cannot follow the redirect itself.
  if (path === '/api/xf/douyin') {
    const id = await resolveDouyinVideoId(url.searchParams.get('url') || '');
    const headers = new Headers(corsHeaders(request));
    headers.set('Cache-Control', 'private, max-age=86400');
    if (!id) return json({ error: 'douyin_unresolved' }, { status: 404, headers });
    return json({ id, embed: `https://open.douyin.com/player/video?vid=${id}&autoplay=0`, page: `https://www.douyin.com/video/${id}` }, { status: 200, headers });
  }

  // XenForo resolves some embeds (flickr, …) through oEmbed instead of an iframe. Neither provider sends CORS
  // headers, so the page relays through us.
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
    // Only the fields the page needs; the raw payload can carry arbitrary URLs.
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

  // Sticker albums are imported straight from imgur. A page cannot skip CORS, so it relays here. The Client-ID
  // is fixed server-side: a query-string one let any caller burn a third party's quota.
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
    // `limit` asks upstream for only the first N bytes, so the avatar freezer can tell an animated avatar from
    // a static one without downloading it in full.
    const limit = Number(url.searchParams.get('limit')) || 0;
    // Cloudflare answers a plain server-side fetch with a challenge page about half the time. A challenge is a
    // 403 with an HTML body, so it is retried; a real 404 is not.
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
    // Avatars carry a `?<mtime>` cache-buster, so the bytes never change and the browser may reuse them.
    // `private` keeps them out of shared caches.
    headers.set('Cache-Control', 'private, max-age=86400');
    if (limit > 0) {
      // Reported so the caller can tell a truncated prefix from the whole file.
      const total = upstream.headers.get('content-range')?.split('/')[1] || upstream.headers.get('content-length') || '';
      if (total) headers.set('X-Image-Total', total);
    }
    return new Response(upstream.body, { status: 200, headers });
  }

  // pik.vn image host. Its uploader sends no CORS headers, so the page relays here. The multipart body must be
  // forwarded untouched so pik.vn's SHA-256 check still matches.
  if (path === '/api/pik/upload' && request.method === 'POST') {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.startsWith('multipart/form-data')) {
      return json({ error: 'Cần multipart/form-data.' }, { status: 400, headers: corsHeaders(request) });
    }
    let upstream;
    try {
      // Buffered, not streamed: forwarding a request stream needs the non-portable `duplex: 'half'` on the edge
      // runtime.
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
    if (active !== tokens) headers.append('Set-Cookie', sessionCookie(active));
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

  if (path === '/api/xf' || path.startsWith('/api/xf/')) {
    return handleProxy(request, url, readSession(request));
  }

  return json({ error: 'not_found', path }, { status: 404 });
}
