/** Image download button. */
import { getImageDownload } from './settings.js';
import { toast } from '../ui/feedback.js';
import { ICON_DOWNLOAD } from '../core/icons.js';

// Sticker-sized images get no button; wide banners do.
const MIN_EDGE = 96;
const MIN_AREA = 20_000;
const WRAPPER_CLASS = 'downloadable-image';
const BUTTON_CLASS = 'image-download-button';
const DOWNLOAD_ICON = ICON_DOWNLOAD;
const CHECK_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 13 4 4 10-10"/></svg>';

const EXCLUDED_CLASSES = ['smilie', 'bbCodeBlockUnfurl-image', 'bbCodeBlockUnfurl-icon', 'reaction-image'];
const EXCLUDED_ANCESTOR = '.media-embed, .contentRow-figure, .contentRow-minor, .sticker-picker, .editor-visual, .editor-preview, .message-signature, .bbCodeBlock--unfurl, .avatar';

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
};

function imageUrl(img) {
  return img.currentSrc || img.src || '';
}

// Declared size wins; a sticker rendered big stays a sticker.
function imageSize(img) {
  const attrWidth = Number(img.getAttribute('width')) || 0;
  const attrHeight = Number(img.getAttribute('height')) || 0;
  return {
    width: attrWidth || img.naturalWidth || 0,
    height: attrHeight || img.naturalHeight || 0,
  };
}

function isSmallImage(img) {
  const { width, height } = imageSize(img);
  if (!width || !height) return true;
  return Math.min(width, height) < MIN_EDGE && width * height < MIN_AREA;
}

function isExcludedImage(img) {
  if (EXCLUDED_CLASSES.some((name) => img.classList.contains(name))) return true;
  if (img.hasAttribute('data-smilie')) return true;
  return Boolean(img.closest(EXCLUDED_ANCESTOR));
}

function wrapperOf(img) {
  const wrapper = img.closest(`.${WRAPPER_CLASS}`);
  return wrapper && wrapper.querySelector(':scope > img, :scope > picture > img') === img ? wrapper : null;
}

function removeControl(img) {
  const wrapper = wrapperOf(img);
  if (!wrapper) return;
  wrapper.querySelector(`:scope > .${BUTTON_CLASS}`)?.remove();
  wrapper.replaceWith(...wrapper.childNodes);
}

function fileName(url, type, forceJpg) {
  let base = 'voz-image';
  try {
    const path = new URL(url, location.href).pathname;
    base = decodeURIComponent(path.split('/').filter(Boolean).pop() || base);
  } catch {
    // Keep fallback name.
  }
  base = base.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0, 120) || 'voz-image';
  const extension = forceJpg ? 'jpg' : EXTENSIONS[type] || base.match(/\.([a-z0-9]{2,5})$/i)?.[1] || 'jpg';
  return `${base.replace(/\.[^.]+$/, '')}.${extension}`;
}

function triggerDownload(blob, name) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  link.rel = 'noopener';
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Firefox reads blobs lazily; early revoke cancels the save.
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

// Same-origin reads directly; cross-origin lacks CORS so use the proxy.
function isSameOrigin(url) {
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

export async function fetchImageBlob(url) {
  return fetchImage(url);
}

async function fetchImage(url) {
  const localProxy = `/api/image-download?url=${encodeURIComponent(url)}`;
  if (isSameOrigin(url)) {
    const response = await fetch(url, { credentials: 'same-origin' }).catch(() => null);
    if (response?.ok) return response.blob();
  }
  const response = await fetch(localProxy);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.blob();
}

// /attachments/<id>/ redirects filename-less; API resolves the canonical URL.
export async function resolveAttachment(url) {
  const id = url.match(/\/attachments\/(?:[^/?#]*\.)?(\d+)\/?$/)?.[1];
  if (!id) return null;
  try {
    const response = await fetch(`/api/xf/attachments/${id}/`, { credentials: 'same-origin' });
    if (!response.ok) return null;
    const { attachment } = await response.json();
    if (!attachment?.direct_url) return null;
    return { url: attachment.direct_url, name: attachment.filename || '' };
  } catch {
    return null;
  }
}

// Animated WebP: canvas would keep frame 1; download untouched.
async function isAnimatedWebp(blob) {
  if (blob.type !== 'image/webp') return false;
  // Container header precedes frame data; a prefix suffices.
  const header = await blob.slice(0, 65_536).text();
  return header.includes('ANIM') && header.includes('ANMF');
}

function blobToJpeg(blob) {
  return new Promise((resolve, reject) => {
    const href = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      // JPEG lacks transparency: flatten WebP onto white.
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(href);
      canvas.toBlob((jpg) => (jpg ? resolve(jpg) : reject(new Error('Không đổi được ảnh sang JPG.'))), 'image/jpeg', 0.92);
    };
    image.onerror = () => {
      URL.revokeObjectURL(href);
      reject(new Error('Không đọc được ảnh WebP.'));
    };
    image.src = href;
  });
}

// Confirm the save; a blocked download would look broken.
function flashSaved(button) {
  button.innerHTML = CHECK_ICON;
  button.classList.add('is-saved');
  toast('Đã tải ảnh.');
  clearTimeout(button._resetTimer);
  button._resetTimer = setTimeout(() => {
    button.innerHTML = DOWNLOAD_ICON;
    button.classList.remove('is-saved');
  }, 1600);
}

async function downloadImage(img, button) {
  const url = imageUrl(img);
  if (!url || button.disabled) return;
  button.disabled = true;
  button.classList.add('is-loading');
  let saved = false;
  try {
    const attachment = await resolveAttachment(url);
    const source = attachment?.url || url;
    const blob = await fetchImage(source);
    // Only static WebP converts; animated stays .webp.
    const webp = (blob.type === 'image/webp' || /\.webp(?:$|[?#])/i.test(source)) && !(await isAnimatedWebp(blob));
    const output = webp ? await blobToJpeg(blob) : blob;
    triggerDownload(output, fileName(attachment?.name || source, blob.type, webp));
    saved = true;
  } catch (error) {
    toast('Không tải được ảnh.', true);
    window.dispatchEvent(new CustomEvent('voz:image-download-error', { detail: error }));
  } finally {
    button.disabled = false;
    button.classList.remove('is-loading');
    if (saved) flashSaved(button);
  }
}

function addControl(img) {
  if (wrapperOf(img) || isExcludedImage(img) || isSmallImage(img)) return;
  // Wrap whole <picture> or it splits from its sources.
  const target = img.closest('picture') || img;
  const wrapper = document.createElement('span');
  wrapper.className = WRAPPER_CLASS;
  target.replaceWith(wrapper);
  wrapper.append(target);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = BUTTON_CLASS;
  button.title = 'Tải ảnh';
  button.setAttribute('aria-label', 'Tải ảnh');
  button.innerHTML = DOWNLOAD_ICON;
  button.addEventListener('click', (event) => {
    // Image may sit inside a link; don't let it open.
    event.preventDefault();
    event.stopPropagation();
    downloadImage(img, button);
  });
  wrapper.append(button);
}

function refresh() {
  const enabled = getImageDownload();
  for (const img of document.querySelectorAll('.message-body img')) {
    if (enabled) addControl(img);
    else removeControl(img);
  }
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

export function wireImageDownloads() {
  refresh();
  // One document observer covers re-renders and appended pages.
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  // Intrinsic size known only after load; re-check on image load.
  document.addEventListener('load', (event) => {
    if (event.target instanceof HTMLImageElement && event.target.closest('.message-body')) schedule();
  }, true);
  window.addEventListener('voz:settings', schedule);
}
