/** Lightbox. */

import { imgSrc } from '../lib/imgProxy.js';

const EXCLUDED_IMAGE_CLASSES = ['smilie', 'bbCodeBlockUnfurl-image', 'bbCodeBlockUnfurl-icon', 'reaction-image'];
const EXCLUDED_ANCESTOR =
  '.media-embed, .sticker-picker, .editor-visual, .editor-preview, .message-signature, .bbCodeBlock--unfurl, .avatar, .member-tooltip, .image-download-button, .save-thumb-load';

let overlay = null;
let gallery = [];
let index = 0;
let onKey = null;
let scrollLock = false;
let zoom = 1;
let panX = 0;
let panY = 0;
const ZOOM_STEP = 1.5;
const ZOOM_MAX = 6;

function isExcludedImage(img) {
  if (EXCLUDED_IMAGE_CLASSES.some((name) => img.classList.contains(name))) return true;
  if (img.hasAttribute('data-smilie')) return true;
  return Boolean(img.closest(EXCLUDED_ANCESTOR));
}

// Resolve the full-size source; relative attachment paths go through the proxy.
function fullSrc(img) {
  const explicit = img.closest('[data-lightbox-src]')?.getAttribute('data-lightbox-src');
  if (explicit) return srcOr(explicit);
  if (img.dataset.saveOriginal) return srcOr(img.dataset.saveOriginal);
  const link = img.closest('a[href]');
  const href = link?.getAttribute('href') || '';
  const candidate = /\.(jpe?g|png|gif|webp|avif|bmp|svg)($|[?#])/i.test(href)
    ? href
    : (img.currentSrc || img.src || '');
  return srcOr(candidate);
}

function srcOr(url) {
  const raw = String(url || '');
  if (/^\/?attachments\//.test(raw) || /^https:\/\/voz\.vn\/attachments\//i.test(raw)) {
    const absolute = raw.startsWith('http') ? raw : `https://voz.vn${raw.startsWith('/') ? '' : '/'}${raw}`;
    return `/api/image-download?url=${encodeURIComponent(absolute)}`;
  }
  return imgSrc(raw);
}

function applyTransform() {
  const img = overlay.querySelector('.lb-image');
  img.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  img.classList.toggle('is-zoomed', zoom > 1);
  overlay.querySelector('.lb-zoom-out').disabled = zoom <= 1;
  overlay.querySelector('.lb-zoom-in').disabled = zoom >= ZOOM_MAX;
}

function setZoom(next, resetPan = true) {
  zoom = Math.min(ZOOM_MAX, Math.max(1, next));
  if (resetPan && zoom <= 1) { panX = 0; panY = 0; }
  applyTransform();
}

function render() {
  const item = gallery[index];
  const img = overlay.querySelector('.lb-image');
  img.src = item.src;
  img.alt = item.alt || '';
  overlay.querySelector('.lb-counter').textContent = gallery.length > 1 ? `${index + 1} / ${gallery.length}` : '';
  overlay.querySelector('.lb-prev').hidden = gallery.length < 2;
  overlay.querySelector('.lb-next').hidden = gallery.length < 2;
  zoom = 1; panX = 0; panY = 0;
  applyTransform();
}

function move(delta) {
  index = (index + delta + gallery.length) % gallery.length;
  render();
}

export function openLightbox(items, startIndex) {
  gallery = items.filter((item) => item.src);
  if (!gallery.length) return;
  index = Math.max(0, Math.min(startIndex, gallery.length - 1));
  closeLightbox();
  overlay = document.createElement('div');
  overlay.className = 'lb-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Xem ảnh');
  overlay.innerHTML = `
    <button type="button" class="lb-btn lb-close" aria-label="Đóng">&times;</button>
    <div class="lb-toolbar">
      <button type="button" class="lb-btn lb-zoom-out" aria-label="Thu nhỏ">&#8722;</button>
      <button type="button" class="lb-btn lb-zoom-in" aria-label="Phóng to">+</button>
    </div>
    <button type="button" class="lb-btn lb-prev" aria-label="Ảnh trước">&#8249;</button>
    <img class="lb-image" alt="" draggable="false">
    <button type="button" class="lb-btn lb-next" aria-label="Ảnh sau">&#8250;</button>
    <div class="lb-counter"></div>`;
  document.body.append(overlay);
  render();

  overlay.addEventListener('click', (event) => {
    if (event.target.closest('.lb-close')) return closeLightbox();
    if (event.target.closest('.lb-zoom-in')) return setZoom(zoom * ZOOM_STEP, false);
    if (event.target.closest('.lb-zoom-out')) return setZoom(zoom / ZOOM_STEP, false);
    if (event.target.closest('.lb-prev')) return move(-1);
    if (event.target.closest('.lb-next')) return move(1);
    // Backdrop/image clicks do not close; only ✕ or Escape.
  });

  // Double-click toggles zoom.
  overlay.addEventListener('dblclick', (event) => {
    if (event.target.closest('.lb-btn')) return;
    event.preventDefault();
    setZoom(zoom > 1 ? 1 : 2);
  });

  // Wheel zoom, expected on desktop lightboxes.
  overlay.addEventListener('wheel', (event) => {
    event.preventDefault();
    setZoom(zoom * (event.deltaY < 0 ? 1.25 : 0.8), false);
  }, { passive: false });

  // Drag pans when zoomed; draggable=false + preventDefault stop Firefox image drag.
  let panStart = null;
  let justPanned = false;
  overlay.addEventListener('pointerdown', (event) => {
    if (zoom <= 1 || event.target.closest('.lb-btn')) return;
    event.preventDefault();
    panStart = { x: event.clientX - panX, y: event.clientY - panY };
    overlay.setPointerCapture?.(event.pointerId);
  });
  overlay.addEventListener('pointermove', (event) => {
    if (!panStart) return;
    panX = event.clientX - panStart.x;
    panY = event.clientY - panStart.y;
    justPanned = true;
    applyTransform();
  });
  overlay.addEventListener('pointerup', () => { panStart = null; });
  overlay.addEventListener('pointercancel', () => { panStart = null; });

  let touchX = null;
  overlay.addEventListener('touchstart', (event) => {
    touchX = zoom > 1 ? null : event.touches[0].clientX;
  }, { passive: true });
  overlay.addEventListener('touchend', (event) => {
    if (touchX == null) return;
    const delta = event.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(delta) > 48) move(delta < 0 ? 1 : -1);
  }, { passive: true });

  onKey = (event) => {
    if (!overlay) return;
    if (event.key === 'Escape') closeLightbox();
    else if (event.key === 'ArrowLeft') move(-1);
    else if (event.key === 'ArrowRight') move(1);
  };
  document.addEventListener('keydown', onKey);
  if (!scrollLock) {
    scrollLock = true;
    document.body.style.overflow = 'hidden';
  }
}

export function closeLightbox() {
  if (!overlay) return;
  overlay.remove();
  overlay = null;
  if (onKey) document.removeEventListener('keydown', onKey);
  onKey = null;
  scrollLock = false;
  document.body.style.overflow = '';
}

// Zoomable images in document order; de-duplicates attachment wrappers.
export function galleryItems(scope) {
  const items = [];
  const seen = new Set();
  for (const img of scope.querySelectorAll('.message-body img, .attachments img')) {
    if (seen.has(img) || isExcludedImage(img)) continue;
    seen.add(img);
    items.push({ img, src: fullSrc(img), alt: img.alt || '' });
  }
  return items.filter((item) => item.src);
}

export function wireLightbox() {
  // Capture phase so linked images open the overlay before navigation.
  document.addEventListener('click', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const img = event.target.closest?.('img');
    if (!img || isExcludedImage(img)) return;
    const scope = img.closest('.message-userContent, .message-body, .attachments');
    if (!scope) return;
    const items = galleryItems(scope.closest('.message-userContent') || scope);
    const start = items.findIndex((item) => item.img === img);
    if (start < 0) return;
    event.preventDefault();
    event.stopPropagation();
    openLightbox(items, start);
  }, true);
}
