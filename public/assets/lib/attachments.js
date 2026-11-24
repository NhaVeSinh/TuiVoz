/** Attachment URLs. */

import { isDataSaving } from './dataSaving.js';
import { imgSrc } from './imgProxy.js';
import { ICON_DOWNLOAD } from '../core/icons.js';

const registry = new Map();

function normalise(attachment) {
  if (!attachment || typeof attachment !== 'object') return null;
  const id = Number(attachment.attachment_id);
  if (!id) return null;
  const url = attachment.direct_url || attachment.url || attachment.thumbnail_url;
  if (!/^https:\/\//.test(String(url || ''))) return null;
  return {
    id,
    url,
    thumbnail: attachment.thumbnail_url || url,
    width: Number(attachment.width) || 0,
    height: Number(attachment.height) || 0,
    filename: attachment.filename || '',
    isVideo: attachment.is_video === true,
    isAudio: attachment.is_audio === true,
  };
}

export function registerAttachments(source) {
  const lists = Array.isArray(source) ? source : [source];
  for (const list of lists) {
    if (!list) continue;
    const items = Array.isArray(list) ? list : Array.isArray(list.Attachments) ? list.Attachments : [list];
    for (const item of items) {
      const attachment = normalise(item);
      if (attachment) registry.set(String(attachment.id), attachment);
    }
  }
  return registry.size;
}

export function getAttachment(id) {
  return registry.get(String(id)) || null;
}

// Reverse lookup: the rendered img only knows its src.
export function attachmentIdForUrl(url) {
  const target = String(url || '');
  if (!target) return null;
  for (const [id, attachment] of registry) {
    if (attachment.url === target) return id;
  }
  return null;
}

export function clearAttachments() {
  registry.clear();
}

// CDN direct_url loads for guests; other routes 403 and use the edge downloader.
export function attachmentViewUrl(attachment) {
  const url = attachment?.direct_url || attachment?.url || '';
  if (/^https:\/\/data\.voz\.vn\//i.test(url)) return imgSrc(url);
  const id = attachment?.attachment_id || attachment?.id || '';
  if (!id) return '';
  return `/api/attachment-download?id=${encodeURIComponent(id)}&name=${encodeURIComponent(attachment?.filename || 'image')}`;
}

// Same rule for an id with no registry entry.
export function attachmentViewUrlForId(id) {
  return `/api/attachment-download?id=${encodeURIComponent(id)}&name=view`;
}

// Data-saving: swap in the low-res thumbnail; src matched by registry id in URL.
export function swapAttachmentThumbnails(root) {
  if (!isDataSaving()) return 0;
  let swapped = 0;
  for (const img of root.querySelectorAll('img')) {
    const src = img.currentSrc || img.getAttribute('src') || '';
    if (!src.includes('/attachments/')) continue;
    const id = attachmentIdFromSrc(src);
    if (!id) continue;
    const attachment = registry.get(id);
    if (!attachment || attachment.isVideo || attachment.isAudio) continue;
    if (!attachment.thumbnail || attachment.thumbnail === attachment.url) continue;
    img.dataset.saveOriginal = src;
    // Only the 1x thumbnail is guaranteed; the 2x variant 404s on some attachments.
    img.setAttribute('src', imgSrc(attachment.thumbnail));
    img.removeAttribute('srcset');
    // Original width/height attrs would stretch the small thumbnail into a blur.
    img.removeAttribute('width');
    img.removeAttribute('height');
    const wrapper = img.ownerDocument.createElement('span');
    wrapper.className = 'save-thumb-wrap';
    img.replaceWith(wrapper);
    wrapper.append(img);
    const chip = img.ownerDocument.createElement('button');
    chip.type = 'button';
    chip.className = 'save-thumb-load';
    chip.setAttribute('aria-label', 'Tải ảnh độ phân giải gốc');
    chip.title = 'Bấm để xem ảnh độ phân giải gốc';
    chip.innerHTML = ICON_DOWNLOAD;
    wrapper.append(chip);
    swapped += 1;
  }
  return swapped;
}

// One delegated tap handler loads the sharp original.
document.addEventListener('click', (event) => {
  const chip = event.target.closest('.save-thumb-load');
  const img = event.target.closest('img[data-save-original]');
  if (!chip && !img) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const target = chip ? chip.parentElement?.querySelector('img[data-save-original]') : img;
  if (!target) return;
  target.setAttribute('src', target.dataset.saveOriginal);
  delete target.dataset.saveOriginal;
  target.closest('.save-thumb-wrap')?.replaceWith(target);
}, true);

function attachmentIdFromSrc(src) {
  const direct = String(src || '').match(/\/attachments\/(?:[^/?#]*\.)?(\d+)(?:\/|\?|#|$)/i);
  if (direct && registry.has(direct[1])) return direct[1];
  for (const candidate of String(src || '').match(/\d+/g) || []) {
    if (candidate.length >= 5 && registry.has(candidate)) return candidate;
  }
  return null;
}

// Image info for an id; null keeps the raw BBCode.
export function attachmentImage(attachment, sizeHint) {
  if (!attachment || attachment.isVideo || attachment.isAudio) return null;
  const src = attachment.url;
  const maxWidth = Number(sizeHint?.width) || attachment.width || 0;
  const maxHeight = Number(sizeHint?.height) || attachment.height || 0;
  return {
    src,
    alt: attachment.filename || `Tệp đính kèm ${attachment.id}`,
    width: maxWidth,
    height: maxHeight,
  };
}