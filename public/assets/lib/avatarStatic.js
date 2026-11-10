// "Tắt ảnh động ảnh đại diện" — freezes an animated avatar on its first frame. The extension lies
// (/avatars/l/15/15207.jpg is a 53-frame GIF), so the bytes decide, not the URL.
import { getStaticAvatars } from './settings.js';

// data.voz.vn sends no CORS headers, so bytes come through the proxy. One entry per URL holding the in-flight
// promise or its result: Promise -> resolving, string -> data URL, null -> leave it alone.
const stills = new Map();

// Avatars already handed to freeze(). A WeakSet so a re-render does not leak.
const seen = new WeakSet();

// Enough bytes to decide a format before downloading the whole file: GIF block structure and WebP/PNG headers
// all sit at the front.
const SNIFF_BYTES = 65_536;

function proxyUrl(url, limit = 0) {
  const query = `/api/image-download?url=${encodeURIComponent(url)}`;
  return limit ? `${query}&limit=${limit}` : query;
}

// --- format sniffing -------------------------------------------------------
// Raw bytes, before any decoding, so a still avatar costs no canvas round trip.

function readAscii(bytes, start, length) {
  let text = '';
  for (let i = start; i < start + length && i < bytes.length; i += 1) text += String.fromCharCode(bytes[i]);
  return text;
}

// Walks the GIF block structure: 0x2C also appears inside LZW data, so a byte scan lies.
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
  // ANIM/ANMF sit in the container header, ahead of the frame payload.
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

// True when the bytes describe more than one frame.
export function isAnimated(bytes) {
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return gifFrameCount(bytes) > 1;
  if (isAnimatedWebp(bytes)) return true;
  return isApng(bytes);
}

// --- freezing --------------------------------------------------------------

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

// Decoding the blob yields frame 1. Without createImageBitmap the live element is drawn instead: not
// necessarily the first frame, but still a still.
async function firstFrame(blob, img) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      // Fall through to the element.
    }
  }
  return img;
}

async function readBytes(source, limit) {
  const response = await fetch(proxyUrl(source, limit));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { bytes: new Uint8Array(await response.arrayBuffer()), headers: response.headers };
}

// Resolves one avatar URL to a still data URL, or null when it must be left alone. Two phases: the prefix
// answers "not animated" for most avatars, the full file only for the rest.
async function resolveStill(source, img) {
  const head = await readBytes(source, SNIFF_BYTES);
  const total = Number(head.headers.get('X-Image-Total')) || 0;
  const truncated = total > head.bytes.length;
  // A prefix holds no GIF trailer, so a count of 1 only means "no second frame yet". WebP and PNG declare
  // themselves in the header, so a prefix is conclusive for those.
  const undecided = truncated && readAscii(head.bytes, 0, 3) === 'GIF';
  if (!isAnimated(head.bytes) && !undecided) return null;

  // Frame 1 has to be decoded, so the whole file is needed.
  const full = await readBytes(source, 0);
  if (!isAnimated(full.bytes)) return null;
  const type = full.headers.get('Content-Type') || '';
  return toDataUrl(await firstFrame(new Blob([full.bytes], { type }), img)) || null;
}

async function freeze(img) {
  const current = img.getAttribute('src') || '';
  // Already frozen: re-checking would refetch on every observer tick.
  if (!current || current.startsWith('data:')) return;
  // 'static' means it is already single-frame.
  if (img.dataset.avatarFreeze === 'static') return;
  img.dataset.avatarSource = current;
  if (!stills.has(current)) stills.set(current, resolveStill(current, img).catch(() => null));
  img.dataset.avatarFreeze = 'pending';
  const still = await stills.get(current);
  // The view may have re-rendered while the proxy was in flight.
  if (!img.isConnected) return;
  if (still) {
    img.src = still;
    delete img.dataset.avatarFreeze;
    return;
  }
  // Static or undecodable: keep voz.vn's own image.
  img.dataset.avatarFreeze = 'static';
}

// Turning the setting off restores the original URL, still on the element.
function restore(img) {
  const source = img.dataset.avatarSource;
  if (!source || !(img.getAttribute('src') || '').startsWith('data:')) return;
  img.src = source;
  delete img.dataset.avatarFreeze;
  // Re-enabling must be able to freeze this avatar again.
  seen.delete(img);
}

// Every avatar renders through `img.avatar-img`. Only avatars that have been on screen are resolved: a list
// page carries 40+ avatars and almost all are stills.
function refresh() {
  const enabled = getStaticAvatars();
  for (const img of document.querySelectorAll('img.avatar-img')) {
    if (!enabled) {
      restore(img);
      continue;
    }
    if (seen.has(img)) continue;
    if (!isOnScreen(img)) continue;
    seen.add(img);
    freeze(img);
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
  // One observer on the body covers both re-renders and appended pages.
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  // Avatars are lazy-loaded, so a fresh one only has a src after its load event.
  document.addEventListener('load', (event) => {
    if (event.target instanceof HTMLImageElement && event.target.classList.contains('avatar-img')) schedule();
  }, true);
  // Scrolling brings skipped avatars into range.
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('voz:settings', schedule);
}
