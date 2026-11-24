/** Media embeds. */

import { isDataSaving } from '../lib/dataSaving.js';

window.addEventListener('message', (event) => {
  const resize = (selector) => {
    let payload = event.data;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch { return null; }
    }
    if (payload === null || payload === undefined) return null;
    return { frame: [...document.querySelectorAll(selector)].find((el) => el.contentWindow === event.source), payload };
  };
  const reddit = ['https://embed.reddit.com', 'https://www.redditmedia.com'].includes(event.origin) ? resize('.media-embed--reddit > iframe') : null;
  if (reddit) {
    if (reddit.payload?.type !== 'resize.embed' || typeof reddit.payload.data !== 'number' || !Number.isFinite(reddit.payload.data)) return;
    reddit.frame.style.height = `${Math.min(3000, Math.max(100, Math.ceil(reddit.payload.data)))}px`;
    return;
  }
  const imgur = event.origin === 'https://imgur.com' ? resize('.media-embed--imgur > iframe') : null;
  if (imgur) {
    // imgur posts { message: "resize_imgur", height } after load.
    if (!imgur.frame || imgur.payload?.message !== 'resize_imgur' || typeof imgur.payload.height !== 'number' || !Number.isFinite(imgur.payload.height)) return;
    imgur.frame.style.height = `${Math.min(3000, Math.max(100, Math.ceil(imgur.payload.height)))}px`;
  }
});

const frameRules = [
  ['youtube.com', /^\/embed\/[\w-]+$/],
  ['www.youtube.com', /^\/embed\/[\w-]+$/],
  ['www.youtube-nocookie.com', /^\/embed\/[\w-]+$/],
  ['player.vimeo.com', /^\/video\/\d+$/],
  ['www.dailymotion.com', /^\/embed\/video\/[\w-]+$/],
  ['www.facebook.com', /^\/plugins\/(?:video|post)\.php$/],
  ['open.spotify.com', /^\/embed\/(?:track|album|playlist|episode|show)\/[\w-]+$/],
  ['w.soundcloud.com', /^\/player\/$/],
  ['www.tiktok.com', /^\/(?:player\/v1|embed\/v2)\/\d+\/?$/],
  ['open.douyin.com', /^\/player\/video$/],
  ['platform.twitter.com', /^\/embed\/Tweet\.html$/],
  ['imgur.com', /^\/[\w-]+\/embed\/?$/],
  ['www.redditmedia.com', /^\/r\/[\w]+\/comments\/[a-z0-9]+(?:\/[\w-]*)?\/?$/i],
  ['embed.reddit.com', /^\/r\/[\w]+\/comments\/[a-z0-9]+(?:\/[\w-]*)?\/?$/i],
];

// oEmbed providers with no iframe URL resolve server-side to an image.
const OEMBED_SITES = {
  flickr: (key) => `https://www.flickr.com/services/oembed/?url=${encodeURIComponent(`https://flic.kr/p/${key}`)}&format=json`,
};

// No buildable URL: the FB SDK swaps .fb-video markup at runtime.
const FACEBOOK_SDK_SRC = 'https://connect.facebook.net/vi_VN/sdk.js';
const FACEBOOK_SDK_ID = 'facebook-jssdk';
let facebookSdkPromise = null;

// Inject SDK once; null on failure so a blocked FB falls back to a link.
function loadFacebookSdk() {
  if (facebookSdkPromise) return facebookSdkPromise;
  facebookSdkPromise = new Promise((resolve) => {
    if (window.FB && typeof window.FB.XFBML === 'object') {
      resolve(window.FB);
      return;
    }
    const previousInit = window.fbAsyncInit;
    window.fbAsyncInit = function () {
      // XFBML turns .fb-video divs into iframes.
      window.FB.init({ xfbml: false, version: 'v21.0' });
      if (typeof previousInit === 'function') previousInit.call(this);
      resolve(window.FB);
    };
    if (document.getElementById(FACEBOOK_SDK_ID)) {
      // Tag already injected; fbAsyncInit still fires.
      return;
    }
    const script = document.createElement('script');
    script.id = FACEBOOK_SDK_ID;
    script.async = true;
    script.defer = true;
    // #xfbml=1 scans on load; later batches parse explicitly.
    script.src = `${FACEBOOK_SDK_SRC}#xfbml=1&version=v21.0`;
    script.onerror = () => resolve(null);
    document.head.append(script);
  });
  return facebookSdkPromise;
}

// Poll for .fb-video placeholders; sanitizeHtml builds in a detached doc.
const FACEBOOK_ATTEMPTS = 40;

function waitForFacebookEmbeds(attempts = FACEBOOK_ATTEMPTS) {
  return new Promise((resolve) => {
    const poll = (left) => {
      const found = [...document.querySelectorAll('.fb-video')].filter((el) => !el.classList.contains('fb_iframe_widget'));
      if (found.length || left <= 0) resolve(found);
      else setTimeout(() => poll(left - 1), 100);
    };
    poll(attempts);
  });
}

async function hydrateFacebook() {
  const pending = await waitForFacebookEmbeds();
  if (!pending.length) return;
  const fb = await loadFacebookSdk();
  if (!fb || typeof fb.XFBML?.parse !== 'function') return;
  // One parse per parent; re-parsing is a no-op.
  const containers = new Set(pending.map((el) => el.parentElement).filter(Boolean));
  for (const container of containers) fb.XFBML.parse(container);
}

// Only poll when this render produced a .fb-video.
function scheduleFacebookHydration(mayHaveFacebook) {
  if (mayHaveFacebook) hydrateFacebook();
}

// Save mode: .fb-video stays for the SDK; tap loads and parses.
function playFacebookPlaceholder(doc) {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'media-play-button';
  button.dataset.mediaFacebook = '1';
  button.textContent = '▶ Nhấn để tải video từ Facebook';
  return button;
}

// Only these Flickr image hosts are trusted.
const OEMBED_IMAGE_HOSTS = ['live.staticflickr.com', 'staticflickr.com', 'farm1.staticflickr.com', 'farm2.staticflickr.com', 'farm3.staticflickr.com', 'farm4.staticflickr.com', 'farm5.staticflickr.com', 'farm6.staticflickr.com', 'farm8.staticflickr.com', 'farm9.staticflickr.com'];

const oembedCache = new Map();

function safeOembedImage(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return OEMBED_IMAGE_HOSTS.includes(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

export function safeMediaUrl(value) {
  try {
    const url = new URL(value, 'https://voz.vn');
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    return frameRules.some(([host, path]) => url.hostname === host && path.test(url.pathname)) ? url.href : null;
  } catch { return null; }
}

function configureFrame(frame, src) {
  // Rebuild rather than trust server/user attributes.
  for (const attr of [...frame.attributes]) frame.removeAttribute(attr.name);
  frame.src = src;
  frame.title = 'Nội dung media nhúng';
  frame.loading = 'lazy';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
  frame.setAttribute('allow', 'fullscreen; picture-in-picture; encrypted-media');
  frame.setAttribute('allowfullscreen', '');
}

// Fetch oEmbed via proxy (no CORS) and swap fallback for the picture.
const OEMBED_SELECTOR = (site, key) => `[data-media-site-id="${CSS.escape(site)}"][data-id="${CSS.escape(key)}"]`;

function findOembedPlaceholders(site, key, attempts = 40) {
  const selector = OEMBED_SELECTOR(site, key);
  return new Promise((resolve) => {
    const poll = (left) => {
      const found = [...document.querySelectorAll(selector)].filter((el) => el.classList.contains('media-embed--oembed'));
      if (found.length || left <= 0) resolve(found);
      else setTimeout(() => poll(left - 1), 100);
    };
    poll(attempts);
  });
}

async function hydrateOembed(site, key, href) {
  const cacheKey = `${site}:${key}`;
  if (!oembedCache.has(cacheKey)) {
    oembedCache.set(
      cacheKey,
      fetch(`/api/xf/oembed?${new URLSearchParams({ site, key })}`, { headers: { Accept: 'application/json' } })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null)
    );
  }
  const data = await oembedCache.get(cacheKey);
  const targets = await findOembedPlaceholders(site, key);
  if (!targets.length) return;
  const src = safeOembedImage(data?.url || data?.thumbnail_url);
  if (!src) {
    oembedCache.delete(cacheKey);
    for (const embed of targets) {
      embed.classList.remove('media-embed--oembed');
      embed.classList.add('media-embed--fallback');
    }
    return;
  }
  for (const embed of targets) {
    // A second pass must not stack pictures.
    if (embed.querySelector('img')) {
      embed.classList.remove('media-embed--oembed');
      continue;
    }
    const doc = embed.ownerDocument;
    const link = doc.createElement('a');
    link.href = data.web_page && /^https:\/\/www\.flickr\.com\//.test(data.web_page) ? data.web_page : href;
    link.target = '_blank';
    link.rel = 'noopener nofollow ugc';
    const img = doc.createElement('img');
    img.src = src;
    img.alt = String(data.title || '').slice(0, 200);
    img.loading = 'lazy';
    img.className = 'bbImage';
    if (Number(data.width) > 0) img.width = Number(data.width);
    if (Number(data.height) > 0) img.height = Number(data.height);
    link.append(img);
    embed.replaceChildren(link);
    const source = doc.createElement('a');
    source.href = link.href;
    source.target = '_blank';
    source.rel = 'noopener nofollow ugc';
    source.className = 'media-source';
    source.textContent = 'Xem trên Flickr';
    embed.append(source);
    embed.classList.remove('media-embed--oembed');
    embed.classList.remove('media-embed--fallback');
  }
}

// Douyin links: swap anchors for the player; short ids resolve via API.
const DOUYIN_SHORT_HOSTS = ['v.douyin.com'];
const DOUYIN_MEDIA_HOSTS = ['www.douyin.com', 'douyin.com', 'www.iesdouyin.com', 'iesdouyin.com'];
const DOUYIN_VIDEO_ID = /\/(?:share\/)?video\/(\d{6,25})(?:[/?#]|$)/;
const DOUYIN_SHORT_CODE = /^\/[\w-]{4,32}\/?$/;
const DOUYIN_EMBED = (id) => `https://open.douyin.com/player/video?vid=${id}&autoplay=0`;
const DOUYIN_PAGE = (id) => `https://www.douyin.com/video/${id}`;

// Save mode defers video players; content embeds still load.
const VIDEO_SITES = ['youtube', 'vimeo', 'tiktok', 'facebook', 'twitter'];
const SITE_LABELS = { youtube: 'YouTube', vimeo: 'Vimeo', tiktok: 'TikTok', facebook: 'Facebook', twitter: 'X' };

// Delegated tap handlers rebuild the real embed on demand.
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-media-frame-src]');
  if (!button) return;
  event.preventDefault();
  const embed = button.closest('.media-embed');
  if (!embed) return;
  const frame = embed.ownerDocument.createElement('iframe');
  configureFrame(frame, button.dataset.mediaFrameSrc);
  frame.className = 'media-frame';
  embed.replaceChildren(frame);
  if (button.dataset.mediaHref) {
    const link = embed.ownerDocument.createElement('a');
    link.href = button.dataset.mediaHref;
    link.target = '_blank';
    link.rel = 'noopener nofollow ugc';
    link.className = 'media-source';
    link.textContent = `Mở trên ${SITE_LABELS[button.dataset.mediaSite] || button.dataset.mediaSite || 'nguồn gốc'}`;
    embed.append(link);
  }
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-media-facebook]');
  if (!button) return;
  event.preventDefault();
  button.disabled = true;
  button.textContent = 'Đang tải video…';
  hydrateFacebook().finally(() => button.remove());
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-media-douyin]');
  if (!button) return;
  event.preventDefault();
  const embed = button.closest('.media-embed');
  if (!embed) return;
  const doc = embed.ownerDocument;
  const frame = doc.createElement('iframe');
  configureFrame(frame, DOUYIN_EMBED(button.dataset.mediaDouyin));
  frame.className = 'media-frame';
  embed.replaceChildren(frame);
  const source = doc.createElement('a');
  source.href = DOUYIN_PAGE(button.dataset.mediaDouyin);
  source.target = '_blank';
  source.rel = 'noopener nofollow ugc';
  source.className = 'media-source';
  source.textContent = 'Mở trên Douyin';
  embed.append(source);
});
// An unfurl card's flex layout squashes the player; replace the card.
const DOUYIN_WRAPPER = 'p, .bbCodeBlock--unfurl';

// Aweme id from a full video URL; short links resolve async.
export function douyinVideoId(value) {
  let url;
  try {
    url = new URL(value, 'https://voz.vn');
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const match = url.pathname.match(DOUYIN_VIDEO_ID);
  return DOUYIN_MEDIA_HOSTS.includes(url.hostname) && match ? match[1] : null;
}

// Both link shapes, incl. unresolved short links.
export function isDouyinLink(value) {
  let url;
  try {
    url = new URL(value, 'https://voz.vn');
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  return DOUYIN_SHORT_HOSTS.includes(url.hostname) && DOUYIN_SHORT_CODE.test(url.pathname);
}

function markDouyin(embed) {
  embed.classList.add('media-embed', 'media-embed--douyin', 'media-embed--portrait');
}

// Anchor → player; false when the id is unknown.
function embedDouyin(anchor, id) {
  if (isDataSaving()) return douyinPlaceholder(anchor, id);
  const doc = anchor.ownerDocument;
  const embed = doc.createElement('div');
  markDouyin(embed);
  const frame = doc.createElement('iframe');
  configureFrame(frame, DOUYIN_EMBED(id));
  frame.className = 'media-frame';
  embed.append(frame);
  const source = doc.createElement('a');
  source.href = DOUYIN_PAGE(id);
  source.target = '_blank';
  source.rel = 'noopener nofollow ugc';
  source.className = 'media-source';
  source.textContent = 'Mở trên Douyin';
  embed.append(source);
  const target = anchor.closest(DOUYIN_WRAPPER);
  (target && target.contains(anchor) ? target : anchor).replaceWith(embed);
  return true;
}

// Save mode: tap-to-load player; short links stay anchors.
function douyinPlaceholder(anchor, id) {
  const doc = anchor.ownerDocument;
  const embed = doc.createElement('div');
  markDouyin(embed);
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'media-play-button';
  button.dataset.mediaDouyin = id;
  button.textContent = '▶ Nhấn để tải video từ Douyin';
  embed.append(button);
  const target = anchor.closest(DOUYIN_WRAPPER);
  (target && target.contains(anchor) ? target : anchor).replaceWith(embed);
  return true;
}

function hydrateDouyinLinks(root) {
  // Skip embedded anchors so re-renders don't stack players.
  const saving = isDataSaving();
  const anchors = [...root.querySelectorAll('a[href]')].filter((a) => !a.closest('.media-embed') && (isDouyinLink(a.getAttribute('href')) || douyinVideoId(a.getAttribute('href'))));
  // Grouped by href: one request per unique link.
  const pending = new Map();
  for (const anchor of anchors) {
    const href = anchor.getAttribute('href');
    const id = douyinVideoId(href);
    if (id) {
      embedDouyin(anchor, id);
      continue;
    }
    if (saving) continue; // short-link resolve costs an API call
    if (!pending.has(href)) pending.set(href, []);
    pending.get(href).push(anchor);
  }
  for (const [href] of pending) resolveDouyinShortLink(href);
}

// Resolved ids per href; failures aren't cached.
const douyinIds = new Map();

function resolveDouyinShortLink(href) {
  if (!douyinIds.has(href)) {
    douyinIds.set(
      href,
      fetch(`/api/xf/douyin?${new URLSearchParams({ url: href })}`, { headers: { Accept: 'application/json' } })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => (data && /^\d{6,25}$/.test(data.id) ? data.id : null))
        .catch(() => null)
        .then((id) => {
          if (!id) douyinIds.delete(href);
          return id;
        })
    );
  }
  return douyinIds
    .get(href)
    .then((id) => {
      if (!id) return;
      // Live copies are found by href in the real document.
      for (const anchor of document.querySelectorAll('a[href]')) {
        if (anchor.getAttribute('href') !== href) continue;
        if (anchor.closest('.media-embed')) continue;
        embedDouyin(anchor, id);
      }
    });
}

export function restoreMedia(root) {
  // Track whether this render produced a .fb-video.
  let sawFacebook = false;
  // Douyin links arrive as plain anchors; found by href.
  hydrateDouyinLinks(root);
  for (const frame of root.querySelectorAll('iframe')) {
    const src = safeMediaUrl(frame.getAttribute('src'));
    if (!src) { frame.remove(); continue; }
    configureFrame(frame, src);
    frame.classList.add('media-frame');
  }
  for (const embed of root.querySelectorAll('[data-media-site-id]')) {
    const site = embed.dataset.mediaSiteId.toLowerCase();
    const key = embed.dataset.mediaKey || embed.dataset.id || '';
    let src;
    let href;
    let pendingOembed = false;
    let pendingFacebook = false;
    if (['twitter', 'x'].includes(site) && /^\d+$/.test(key)) {
      src = `https://platform.twitter.com/embed/Tweet.html?id=${key}&dnt=true`;
      href = `https://x.com/i/status/${key}`;
    } else if (site === 'tiktok' && /^\d+$/.test(key)) {
      src = `https://www.tiktok.com/player/v1/${key}`;
      href = `https://www.tiktok.com/@_/video/${key}`;
    } else if (site === 'reddit' && /^\w+\/comments\/[a-z0-9]+(?:\/[\w-]*)?\/?$/i.test(key)) {
      src = `https://www.redditmedia.com/r/${key}?ref_source=embed&ref=share&embed=true`;
      href = `https://www.reddit.com/r/${key}`;
    } else if (site === 'youtube' && /^[\w-]{11}$/.test(key)) {
      src = `https://www.youtube.com/embed/${key}`;
      href = `https://www.youtube.com/watch?v=${key}`;
    } else if (site === 'imgur' && /^[\w-]{5,12}$/.test(key)) {
      src = `https://imgur.com/${key}/embed`;
      href = `https://imgur.com/${key}`;
    } else if (OEMBED_SITES[site] && /^[\w-]{3,32}$/.test(key)) {
      // oEmbed resolves async to a picture, not a frame.
      href = site === 'flickr' ? `https://flic.kr/p/${key}` : '';
      pendingOembed = true;
    } else if (site === 'facebook' && /^\d+$/.test(key) && embed.querySelector('.fb-video')) {
      // Keep .fb-video markup untouched; the SDK needs its data attrs.
      pendingFacebook = true;
      sawFacebook = true;
      if (isDataSaving()) embed.append(playFacebookPlaceholder(root.ownerDocument));
    }
    let frame = embed.querySelector('iframe');
    if (src) {
      embed.replaceChildren();
      if (isDataSaving() && VIDEO_SITES.includes(site)) {
        // Save mode: iframe (MBs of player JS) loads on tap.
        const button = root.ownerDocument.createElement('button');
        button.type = 'button';
        button.className = 'media-play-button';
        button.dataset.mediaFrameSrc = src;
        if (href) button.dataset.mediaHref = href;
        button.dataset.mediaSite = site;
        button.textContent = `▶ Nhấn để tải video từ ${SITE_LABELS[site] || site}`;
        embed.append(button);
      } else {
        frame = root.ownerDocument.createElement('iframe');
        configureFrame(frame, src);
        frame.className = 'media-frame';
        embed.append(frame);
      }
      const link = root.ownerDocument.createElement('a');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener nofollow ugc';
      link.className = 'media-source';
      link.textContent = `Mở trên ${site === 'twitter' ? 'X' : site}`;
      embed.append(link);
    }
    embed.classList.add('media-embed');
    if (site === 'tiktok') embed.classList.add('media-embed--portrait');
    if (site === 'reddit') embed.classList.add('media-embed--reddit');
    if (site === 'imgur') embed.classList.add('media-embed--imgur');
    if (site === 'facebook') embed.classList.add('media-embed--facebook');
    if (['twitter', 'x', 'reddit'].includes(site)) embed.classList.add('media-embed--social');
    // Pending oEmbed keeps fallback till the picture lands.
    if (pendingOembed) {
      embed.classList.add('media-embed--oembed');
      hydrateOembed(site, key, href);
    } else if (!frame && !pendingFacebook) embed.classList.add('media-embed--fallback');
  }
  // SDK parse needs the live document; save mode defers it.
  if (!isDataSaving()) scheduleFacebookHydration(sawFacebook);
  for (const frame of root.querySelectorAll('iframe.media-frame')) {
    if (!frame.closest('.media-embed')) {
      const wrapper = root.ownerDocument.createElement('div');
      wrapper.className = 'media-embed';
      frame.replaceWith(wrapper);
      wrapper.append(frame);
    }
  }
}
