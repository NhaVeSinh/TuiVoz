/** BBCode helpers. */

import { renderSmilies } from './smilies.js';
import { restoreMedia } from './media.js';
import { restoreQuoteLinks } from './quotes.js';
import { restoreSpoilers } from './spoilers.js';
import { rewriteVozLinks } from './postLinks.js';
import { getAttachment, attachmentViewUrl, attachmentViewUrlForId } from './attachments.js';

// Sanitize server HTML; image sizes re-applied from raw BBCode.
export function sanitizeHtml(html, bbcode) {
  const doc = new DOMParser().parseFromString(`<div id="root">${html || ''}</div>`, 'text/html');
  const root = doc.getElementById('root');
  restoreSpoilers(root, bbcode);
  root.querySelectorAll('script, style, object, embed, form, input, button').forEach((el) => el.remove());
  for (const el of root.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) el.removeAttribute(attr.name);
      if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
    if (el.tagName === 'A') {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener nofollow ugc');
    }
  }
  // After the _blank pass: in-app links navigate in place.
  rewriteVozLinks(root);
  restoreQuoteLinks(root, bbcode);
  restoreMedia(root);
  rewriteAttachmentImages(root);
  applyImageSizes(root, bbcode);
  renderSmilies(root);
  return root.innerHTML;
}

function normalizeImgSrc(src) {
  const raw = String(src || '').trim();
  // Both attachment URL shapes key on the id.
  const attach = raw.match(/\/attachments\/(?:[^/?#]*\.)?(\d+)\/?/i);
  if (attach) return `attach:${attach[1]}`;
  return raw
    .replace(/^https?:\/\/voz\.vn/i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

// Extract size/width/height attrs from [IMG]/[ATTACH] tags.
function parseBbcodeImageSizes(bbcode) {
  const sizes = new Map();
  const re = /\[(IMG|ATTACH)([^\]]*)\]([\s\S]*?)\[\/\1\]/gi;
  let match;
  while ((match = re.exec(bbcode || ''))) {
    const tag = match[1].toUpperCase();
    const attrs = match[2];
    const inner = match[3].trim();
    let src;
    if (tag === 'IMG') {
      src = inner;
    } else {
      const id = inner.replace(/\D/g, '');
      if (!id) continue;
      src = `attach:${id}`;
    }
    const size = attrs.match(/size\s*=\s*"(\d+)\s*x\s*(\d+)"/i);
    const width = attrs.match(/width\s*=\s*"(\d+)/i);
    const height = attrs.match(/height\s*=\s*"(\d+)/i);
    const spec = {};
    if (size) {
      spec.width = Number(size[1]);
      spec.height = Number(size[2]);
    } else {
      if (width) spec.width = Number(width[1]);
      if (height) spec.height = Number(height[1]);
    }
    if (spec.width || spec.height) sizes.set(normalizeImgSrc(src), spec);
  }
  return sizes;
}

// voz.vn/attachments/<id>/ 403s for guests; point at CDN/edge URL.
function rewriteAttachmentImages(root) {
  for (const img of root.querySelectorAll('img[src*="/attachments/"]')) {
    const src = img.getAttribute('src') || '';
    if (/^https:\/\/data\.voz\.vn\//i.test(src)) continue;
    const id = src.match(/\/attachments\/(?:[^/?#]*\.)?(\d+)/)?.[1];
    if (!id) continue;
    const attachment = getAttachment(id);
    const url = attachment ? attachmentViewUrl(attachment) : attachmentViewUrlForId(id);
    if (url) img.setAttribute('src', url);
    const link = img.closest('a[href*="/attachments/"]');
    if (link) link.setAttribute('href', url || link.getAttribute('href'));
  }
}

function applyImageSizes(root, bbcode) {
  const sizes = parseBbcodeImageSizes(bbcode);
  for (const img of root.querySelectorAll('img')) {
    if (img.closest('.bbCodeBlock--unfurl')) continue;
    img.classList.add('bbImage');
    // Lazy so off-screen posts don't pull multi-MB originals.
    img.loading = 'lazy';
    img.decoding = 'async';
    if (!sizes.size) continue;
    const spec = sizes.get(normalizeImgSrc(img.getAttribute('src')));
    if (!spec) continue;
    if (spec.width) img.setAttribute('width', String(spec.width));
    if (spec.height) img.setAttribute('height', String(spec.height));
  }
}

export function bbcodeToPlain(bbcode) {
  return String(bbcode || '')
    .replace(/\[quote(?:=[^\]]*)?\][\s\S]*?\[\/quote\]/gi, '')
    .replace(/\[\/?[a-z*][^\]]*\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function stripQuotes(bbcode) {
  let depth = 0;
  let out = '';
  let last = 0;
  const re = /\[(\/?)quote(?:=[^\]]*)?\]/gi;
  let match;
  while ((match = re.exec(bbcode))) {
    if (depth === 0) out += bbcode.slice(last, match.index);
    depth += match[1] ? -1 : 1;
    if (depth < 0) depth = 0;
    last = re.lastIndex;
  }
  if (depth === 0) out += bbcode.slice(last);
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

export function quoteBlock(post) {
  const author = String(post.username || '').replace(/"/g, '');
  const member = post.user_id ? `, member: ${post.user_id}` : '';
  const body = stripQuotes(post.message || '');
  // Caller adds the trailing blank line; two rendered as three.
  return `[QUOTE="${author}, post: ${post.post_id}${member}"]\n${body}\n[/QUOTE]`;
}
