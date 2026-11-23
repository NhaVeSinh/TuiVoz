// Attachment URL resolution for the visual editor. A post body carries [ATTACH]3860636[/ATTACH] while the real
// URL lives in post.Attachments[], so the view registers what it fetched.

import { isDataSaving } from './dataSaving.js';
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

// Registers attachments from one or more posts.
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

// Reverse lookup: the rendered <img> only knows its src.
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

// Where a guest can actually load an attachment: direct_urls on the data.voz.vn CDN load fine, but a
// voz.vn/attachments/<name>.<id>/ route redirects through Cloudflare and answers 403 without a forum cookie,
// so anything else goes through the edge downloader. `?name=` marks the response Content-Disposition inline
// so <img> can render it; the plain /?id= form stays an attachment download.
export function attachmentViewUrl(attachment) {
  const url = attachment?.direct_url || attachment?.url || '';
  if (/^https:\/\/data\.voz\.vn\//i.test(url)) return url;
  const id = attachment?.attachment_id || attachment?.id || '';
  if (!id) return '';
  return `/api/attachment-download?id=${encodeURIComponent(id)}&name=${encodeURIComponent(attachment?.filename || 'image')}`;
}

// Same rule for an id with no registry entry (quotes, conversations that never called registerAttachments).
export function attachmentViewUrlForId(id) {
  return `/api/attachment-download?id=${encodeURIComponent(id)}&name=view`;
}

// Data-saving: attachments render their low-res thumbnail as the preview — recognisable, ~13KB instead of a
// multi-hundred-KB original — with a download button sized to ~22% of the picture on top, so the softness
// reads as a deliberate loading state and one tap brings in the sharp original. Non-save rendering is
// untouched, and only attachments that actually carry a distinct thumbnail are swapped.
//
// Matching can't be string equality: rendered post HTML references attachments as relative
// /attachments/<name>-webp.<id>/ paths (the registry holds absolute direct_urls), and [IMG]-pasted images use
// data.voz.vn/attachments/<folder>/<id>-<hash>.<ext> full-size URLs. So every number in the URL is a
// candidate, and only one that actually exists in the registry counts — which also keeps a thumbnail URL's
// own id (3877482, different from its attachment) from ever matching.
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
    // The 1x thumbnail is the only size voz.vn guarantees to exist — the 2x retina variant 404s on some
    // attachments, which made whole pictures vanish. At its natural size the preview is sharp, small, and
    // ~20% of the original's bytes; one tap brings in the original.
    img.setAttribute('src', attachment.thumbnail);
    img.removeAttribute('srcset');
    // voz's HTML emits the original's width/height attributes; a 150px thumbnail stretched to them is the
    // blur this lever exists to prevent. Natural size + the wrapper's max-width handle display instead.
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

// One tap handler for every swapped image: the button (or the image itself) loads the sharp original.
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

// Markup for an attachment id, or null when unknown so the caller keeps the raw BBCode.
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