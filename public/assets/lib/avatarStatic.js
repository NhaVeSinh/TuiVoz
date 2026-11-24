/** Static avatars. */
import { getStaticAvatars } from './settings.js';
import { isDataSaving } from './dataSaving.js';

// Proxy (no CORS on data.voz.vn); value: promise, data URL, or null.
const stills = new Map();

// Frozen avatars; WeakSet so re-renders don't leak.
const seen = new WeakSet();

// GIF/WebP/PNG headers sit at the front; 64KB suffices.
const SNIFF_BYTES = 65_536;

function proxyUrl(url, limit = 0) {
  const query = `/api/image-download?url=${encodeURIComponent(url)}`;
  return limit ? `${query}&limit=${limit}` : query;
}

// format sniffing
// Raw-byte sniffing avoids a canvas decode for still avatars.

function readAscii(bytes, start, length) {
  let text = '';
  for (let i = start; i < start + length && i < bytes.length; i += 1) text += String.fromCharCode(bytes[i]);
  return text;
}

// Walk GIF blocks; a byte-scan lies (0x2C inside LZW data).
export function gifFrameCount(bytes) {
  if (readAscii(bytes, 0, 3) !== 'GIF') return 0;
  let i = 6;
  const packed = bytes[i + 4];
  i += 7;
  if (packed & 0x80) i += 3 * (1 << ((packed & 0x07) + 1));
  let frames = 0;
  const skipSubBlocks = () => {
    while (i < bytes.length) {
      const size = bytes[i];
      i += 1;
      if (!size) return;
      i += size;
    }
  };
  while (i < bytes.length) {
    const marker = bytes[i];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      i += 2;
      skipSubBlocks();
    } else if (marker === 0x2c) {
      frames += 1;
      const flags = bytes[i + 9];
      i += 10;
      if (flags & 0x80) i += 3 * (1 << ((flags & 0x07) + 1));
      i += 1;
      skipSubBlocks();
    } else {
      break;
    }
  }
  return frames;
}

export function isAnimatedWebp(bytes) {
  if (readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WEBP') return false;
  // ANIM/ANMF precede the frame payload.
  const header = readAscii(bytes, 12, Math.min(65_536, bytes.length - 12));
  return header.includes('ANIM') && header.includes('ANMF');
}

export function isApng(bytes) {
  if (bytes[0] !== 0x89 || readAscii(bytes, 1, 3) !== 'PNG') return false;
  // `acTL` must precede the first `IDAT`.
  const text = readAscii(bytes, 8, Math.min(65_536, bytes.length - 8));
  const control = text.indexOf('acTL');
  const data = text.indexOf('IDAT');
  return control >= 0 && (data < 0 || control < data);
}

export function isAnimated(bytes) {
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return gifFrameCount(bytes) > 1;
  if (isAnimatedWebp(bytes)) return true;
  return isApng(bytes);
}

// freezing

function toDataUrl(frame) {
  const width = frame.width || frame.naturalWidth;
  const height = frame.height || frame.naturalHeight;
  if (!width || !height) return '';
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return '';
  context.drawImage(frame, 0, 0, width, height);
  // PNG, not JPEG: an avatar may carry transparency.
  return canvas.toDataURL('image/png');
}

// Decode frame 1; fall back to the live element.
async function firstFrame(blob, img) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      // Fall back to the element.
    }
  }
  return img;
}

async function readBytes(source, limit) {
  const response = await fetch(proxyUrl(source, limit));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { bytes: new Uint8Array(await response.arrayBuffer()), headers: response.headers };
}

// Prefix sniff first; full file only for undecided GIFs.
async function resolveStill(source, img) {
  const head = await readBytes(source, SNIFF_BYTES);
  const total = Number(head.headers.get('X-Image-Total')) || 0;
  const truncated = total > head.bytes.length;
  // A truncated GIF is undecided; WebP/PNG declare in the header.
  const undecided = truncated && readAscii(head.bytes, 0, 3) === 'GIF';
  if (!isAnimated(head.bytes) && !undecided) return null;

  // Frame 1 decode needs the whole file.
  const full = await readBytes(source, 0);
  if (!isAnimated(full.bytes)) return null;
  const type = full.headers.get('Content-Type') || '';
  return toDataUrl(await firstFrame(new Blob([full.bytes], { type }), img)) || null;
}

// Freeze painted bytes: at DPR>1 that's the srcset candidate, not src.
function paintedSource(img) {
  const current = img.currentSrc || '';
  return current && !current.startsWith('data:') ? current : null;
}

async function freeze(img) {
  // Skip already-frozen/proven-static images or every tick refetches.
  if (img.dataset.avatarFreeze) return true;
  const source = paintedSource(img);
  if (!source) return false;
  img.dataset.avatarSource = img.getAttribute('src') || source;
  // srcset outranks src; stash it for restore.
  if (img.hasAttribute('srcset')) img.dataset.avatarSrcset = img.getAttribute('srcset');
  if (!stills.has(source)) stills.set(source, resolveStill(source, img).catch(() => null));
  img.dataset.avatarFreeze = 'pending';
  const still = await stills.get(source);
  // The view may have re-rendered during the fetch.
  if (!img.isConnected) return true;
  if (still) {
    img.removeAttribute('srcset');
    img.src = still;
    delete img.dataset.avatarFreeze;
    return true;
  }
  // Static or undecodable: keep voz.vn's own image.
  img.dataset.avatarFreeze = 'static';
  return true;
}

// Restore original URL and srcset stashed on the element.
function restore(img) {
  const source = img.dataset.avatarSource;
  if (!source || !(img.getAttribute('src') || '').startsWith('data:')) return;
  img.src = source;
  if (img.dataset.avatarSrcset) img.setAttribute('srcset', img.dataset.avatarSrcset);
  delete img.dataset.avatarSrcset;
  delete img.dataset.avatarFreeze;
  // Re-enabling must be able to re-freeze this avatar.
  seen.delete(img);
}

// Only freeze avatars that were on screen; a list page carries 40+.
function refresh() {
  // Freezing costs a proxy probe plus a PNG re-encode — skip in save mode.
  if (isDataSaving()) return;
  const enabled = getStaticAvatars();
  for (const img of document.querySelectorAll('img.avatar-img')) {
    if (!enabled) {
      restore(img);
      continue;
    }
    if (seen.has(img)) continue;
    if (!isOnScreen(img)) continue;
    seen.add(img);
    // Unloaded lazy avatar: load event re-queues it.
    freeze(img).then((handled) => { if (!handled) seen.delete(img); });
  }
}

function isOnScreen(img) {
  const box = img.getBoundingClientRect();
  if (!box.width || !box.height) return false;
  return box.bottom > -200 && box.top < window.innerHeight + 200;
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    refresh();
  });
}

export function wireStaticAvatars() {
  refresh();
  // One body observer covers re-renders and appended pages.
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  // Lazy avatars only get a src after their load event.
  document.addEventListener('load', (event) => {
    if (event.target instanceof HTMLImageElement && event.target.classList.contains('avatar-img')) schedule();
  }, true);
  // Scrolling brings skipped avatars into view.
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('voz:settings', schedule);
}
