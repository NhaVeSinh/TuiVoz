// Local dev server: serves public/ and routes /api/* to the edge handler. Usage: node dev-server.mjs [port].
// Not deployed — Vercel only serves public/ and api/.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = join(ROOT, 'public');
const PORT = Number(process.argv[2] || process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const { default: handler } = await import('./api/handler.js');
const { default: ogHandler } = await import('./api/og.js');

// Crawlers that need server-rendered Open Graph tags. Mirrors the `has` rule in vercel.json.
const CRAWLER_UA = /facebookexternalhit|Facebot|Twitterbot|TelegramBot|WhatsApp|Discordbot|Slackbot|LinkedInBot|Zalo|Pinterest|redditbot|Applebot|Googlebot|bingbot|YandexBot|DuckDuckBot|Baiduspider|Embedly|Iframely|vkShare|W3C_Validator|curl|wget|python-requests|Go-http-client|axios|node-fetch/i;

// Everything under /assets/ plus the shell's own filenames must be a real file; other paths are SPA routes.
const ASSET_RE = /^\/(assets|userscript)\//;
// Files the browser requests by fixed name; a missing one must 404, not return the shell.
const ROOT_FILES = new Set(['/favicon.ico', '/site.webmanifest', '/robots.txt']);

function toRequest(req, body) {
  const url = `http://${req.headers.host || `localhost:${PORT}`}${req.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else headers.set(key, value);
  }
  const init = { method: req.method, headers };
  if (body && body.length) init.body = body;
  return new Request(url, init);
}

async function sendWebResponse(res, webRes) {
  const headers = {};
  webRes.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return;
    headers[key] = value;
  });
  const cookies = typeof webRes.headers.getSetCookie === 'function' ? webRes.headers.getSetCookie() : [];
  if (cookies.length) headers['set-cookie'] = cookies;
  res.writeHead(webRes.status, headers);
  const buffer = Buffer.from(await webRes.arrayBuffer());
  res.end(buffer);
}

async function serveStatic(req, res, pathname) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  let filePath = join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  let missing = false;
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    missing = true;
  }
  if (missing) {
    // The SPA fallback is for route paths only. A missing asset must 404: answering 200 with HTML hid 404s and
    // turned a typo'd script into "unexpected token <".
    if (ASSET_RE.test(pathname) || ROOT_FILES.has(pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    filePath = join(PUBLIC_DIR, 'index.html');
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const webRes = await handler(toRequest(req, body));
      await sendWebResponse(res, webRes);
      return;
    }
    // A crawler (or `?og=1` for manual checks) gets the shell with server-rendered Open Graph tags, matching the
    // vercel.json rule so previews can be verified locally.
    const wantsOg =
      (CRAWLER_UA.test(req.headers['user-agent'] || '') || url.searchParams.has('og')) &&
      !ASSET_RE.test(url.pathname) &&
      !ROOT_FILES.has(url.pathname);
    if (wantsOg) {
      url.searchParams.delete('og');
      const webRes = await ogHandler(toRequest(req, Buffer.alloc(0)));
      await sendWebResponse(res, webRes);
      return;
    }
    await serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error('dev-server error', err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(String(err && err.stack));
  }
});

server.listen(PORT, () => {
  console.log(`voz-forum dev server → http://localhost:${PORT}`);
});
