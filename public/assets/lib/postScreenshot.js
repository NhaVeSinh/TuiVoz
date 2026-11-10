// "Chụp bài viết" — rasterise one post plus the thread title into a PNG. Pictures go through the proxy as
// data URLs (a canvas cannot read a cross-origin <img>), and layout comes from an SVG <foreignObject>.

import { toast } from '../ui/feedback.js';
import { getPostScreenshot } from './settings.js';
import { resolveAttachment, fetchImageBlob } from './imageDownload.js';

const BUTTON_CLASS = 'post-screenshot-button';
const ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 13 4 4 10-10"/></svg>';

// Rendered at up to 2x so text stays sharp. A very long post would allocate a bitmap big enough to fail, so the
// scale drops until it fits. The post is never clipped.
const SCALE = 2;
const MAX_PIXELS = 40_000_000;
// Firefox refuses a foreignObject taller than its coordinate space, so a very long post is capped here.
const MAX_HEIGHT = 16000;

function threadTitle() {
  const el = document.getElementById('thread-title');
  if (!el) return document.title || '';
  // The header holds a prefix badge plus the title; only the text is wanted.
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.label, .labelLink, .prefix').forEach((n) => n.remove());
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

function inlineStyles() {
  let css = '';
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      // A cross-origin sheet throws; those rules are not needed, the fonts are already loaded.
      continue;
    }
    for (const rule of rules) css += `${rule.cssText}\n`;
  }
  return css;
}

// Re-encode through the proxy so the canvas stays untainted. Unreadable images are dropped rather than failing
// the whole capture.
async function toDataUrl(img) {
  const url = img.currentSrc || img.src || '';
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  // Attachments resolve to their canonical URL first: the short form is a redirect that Cloudflare often
  // answers with a challenge.
  const resolved = await resolveAttachment(url);
  const source = resolved?.url || url;
  const blob = await fetchImageBlob(source).catch(() => null);
  if (!blob) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

async function inlineImages(root) {
  const images = [...root.querySelectorAll('img')];
  await Promise.all(images.map(async (img) => {
    const data = await toDataUrl(img);
    if (data) {
      img.setAttribute('src', data);
      img.removeAttribute('srcset');
      img.removeAttribute('loading');
      img.style.width = img.style.width || `${img.getBoundingClientRect().width}px`;
    } else {
      img.remove();
    }
  }));
}

function buildSheet(threadName, postNode) {
  // A plain wrapper is easier to measure and keeps the title above the post.
  const holder = document.createElement('div');
  holder.className = 'screenshot-sheet';
  holder.style.cssText = 'box-sizing:border-box;background:#fff;padding:16px;font-family:inherit;';
  const heading = document.createElement('div');
  heading.className = 'screenshot-title';
  heading.textContent = threadName;
  holder.append(heading, postNode);
  return holder;
}

function rasterize(node) {
  const width = Math.ceil(node.scrollWidth || node.getBoundingClientRect().width);
  const height = Math.ceil(node.scrollHeight || node.getBoundingClientRect().height);
  // Keep the full post: shrink the pixel ratio instead of cropping.
  let scale = SCALE;
  if (height * scale > MAX_HEIGHT) scale = MAX_HEIGHT / height;
  while (width * scale * (height * scale) > MAX_PIXELS && scale > 0.5) scale -= 0.1;
  const outWidth = Math.max(1, Math.round(width * scale));
  const outHeight = Math.max(1, Math.round(height * scale));

  // The measuring copy is parked off-screen; that offset must not leak into the SVG, or the bitmap comes out
  // blank.
  const clone = node.cloneNode(true);
  clone.style.position = 'static';
  clone.style.left = 'auto';
  clone.style.top = 'auto';
  clone.style.width = `${width}px`;
  const style = `<style>${inlineStyles()}</style>`;
  const markup = new XMLSerializer().serializeToString(clone);
  // `viewBox` keeps the layout in CSS pixels while width/height apply the scale, so text wraps identically at
  // any ratio.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${outWidth}" height="${outHeight}" viewBox="0 0 ${width} ${height}">` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;background:#fff">${style}${markup}</div>` +
    '</foreignObject></svg>';

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = outWidth;
      canvas.height = outHeight;
      const context = canvas.getContext('2d');
      // Painted on white so a transparent background does not flatten to black.
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, outWidth, outHeight);
      URL.revokeObjectURL(href);
      canvas.toBlob((png) => (png ? resolve(png) : reject(new Error('Không tạo được ảnh PNG.'))), 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(href);
      reject(new Error('Không dựng được ảnh bài viết.'));
    };
    image.src = href;
  });
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
  // Firefox reads the blob lazily, so revoking immediately would cancel the save.
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

function fileName(post) {
  const base = `voz-post-${post?.post_id || 'unknown'}`;
  return `${base}.png`;
}

function flashSaved(button) {
  button.innerHTML = CHECK_ICON;
  button.classList.add('is-saved');
  clearTimeout(button._resetTimer);
  button._resetTimer = setTimeout(() => {
    button.innerHTML = ICON;
    button.classList.remove('is-saved');
  }, 1600);
}

async function capturePost(article, button) {
  if (button.disabled) return;
  button.disabled = true;
  button.classList.add('is-loading');
  const scrollY = window.scrollY;
  try {
    const source = article.cloneNode(true);
    source.querySelectorAll(`.${BUTTON_CLASS}`).forEach((n) => n.remove());
    // The clone is measured off-screen, then rasterised; it never becomes visible.
    const sheet = buildSheet(threadTitle(), source);
    sheet.style.position = 'fixed';
    sheet.style.left = '-100000px';
    sheet.style.top = '0';
    sheet.style.width = `${Math.min(document.documentElement.clientWidth, 900)}px`;
    document.body.append(sheet);
    try {
      await inlineImages(sheet);
      const png = await rasterize(sheet);
      triggerDownload(png, fileName({ post_id: article.dataset.postId }));
    } finally {
      sheet.remove();
    }
    flashSaved(button);
    toast('Đã lưu ảnh bài viết.');
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Không chụp được bài viết.', true);
    window.dispatchEvent(new CustomEvent('voz:post-screenshot-error', { detail: error }));
  } finally {
    button.disabled = false;
    button.classList.remove('is-loading');
    // Measuring can nudge the scroll position; the reader must not lose their place.
    if (window.scrollY !== scrollY) window.scrollTo(0, scrollY);
  }
}

function removeControl(article) {
  const button = article.querySelector(`:scope .${BUTTON_CLASS}`);
  // The control is wrapped in a list item; an empty <li> would keep its flex gap.
  const host = button?.closest('.message-attribution-opposite > li') || button;
  host?.remove();
  article.classList.remove('has-screenshot-button');
}

function addControl(article) {
  const list = article.querySelector('.message-attribution-opposite');
  if (!list || article.querySelector(`:scope .${BUTTON_CLASS}`)) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = BUTTON_CLASS;
  button.title = 'Chụp bài viết';
  button.setAttribute('aria-label', 'Chụp bài viết');
  button.innerHTML = ICON;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    capturePost(article, button);
  });
  // Before the bookmark, so it never covers the post number.
  const item = document.createElement('li');
  item.append(button);
  list.prepend(item);
  article.classList.add('has-screenshot-button');
}

function refresh() {
  const enabled = getPostScreenshot();
  for (const article of document.querySelectorAll('#post-list .message--post')) {
    if (enabled) addControl(article);
    else removeControl(article);
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

export function wirePostScreenshots() {
  refresh();
  // One observer on the body covers both re-renders and appended pages.
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('voz:settings', schedule);
}
