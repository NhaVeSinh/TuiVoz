// "Chụp bài viết" — rasterise one post plus the thread title into a PNG. Pictures go through the proxy as
// data URLs (a canvas cannot read a cross-origin <img>), and layout comes from an SVG <foreignObject>.

import { toast } from '../ui/feedback.js';
import { getPostScreenshot, getFontScale, normalizeFontScale } from './settings.js';
import { resolveAttachment, fetchImageBlob } from './imageDownload.js';
import { pruneUnloadedReactionStrips } from '../ui/reactions.js';

const BUTTON_CLASS = 'post-screenshot-button';
const ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 13 4 4 10-10"/></svg>';

// Rendered at up to 2x so text stays sharp. A very long post would allocate a bitmap big enough to fail, so the
// scale drops until it fits. The post is never clipped.
const SCALE = 2;
const MAX_PIXELS = 40_000_000;
// Firefox refuses a foreignObject taller than its coordinate space, so a very long post is capped here.
const MAX_HEIGHT = 16000;

// A post keeps its two-column shape at every size, so the sheet's width drives the layout. Above 1000px the
// capture uses the page's own column width, capped so a huge monitor does not produce a wall of whitespace.
const MAX_SHEET_WIDTH = 1000;
function layoutWidth(article) {
  const viewport = document.documentElement.clientWidth;
  if (viewport > MAX_SHEET_WIDTH) return Math.min(Math.round(article.getBoundingClientRect().width) || MAX_SHEET_WIDTH, MAX_SHEET_WIDTH);
  return viewport > 600 ? 600 : 430;
}

// The reader's own text size must survive into the picture, or the PNG disagrees with what they see.
function scaleTokens() {
  const { uiSize, postSize } = getFontScale();
  return { ui: normalizeFontScale(uiSize) / 100, post: normalizeFontScale(postSize) / 100 };
}

function threadTitle() {
  const el = document.getElementById('thread-title');
  if (!el) return document.title || '';
  // The header holds a prefix badge plus the title; only the text is wanted.
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.label, .labelLink, .prefix').forEach((n) => n.remove());
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

// Firefox matches `:root` and `[data-theme]` inside a foreignObject but never `html` or `:root[data-theme]`.
// Anchoring those rules on the sheet wrapper instead makes them resolve, because the wrapper carries the same
// data-theme/data-font attributes as the live document.
const ROOT_AT = /(^|[\s,>+~])(?::root|html)(?![-\w])/;

function remapSelector(selector) {
  const trimmed = selector.trim();
  const match = ROOT_AT.exec(trimmed);
  if (!match) return trimmed;
  const after = trimmed.slice(match.index + match[0].length).trim();
  // Nothing follows, so the rule styles the document root itself (tokens, color-scheme). Keep it on `:root`.
  if (after === '') return match[1] + ':root' + trimmed.slice(match.index + match[0].length);
  return trimmed.slice(0, match.index) + match[1] + after;
}

function prefixSelector(text) {
  const open = text.indexOf('{');
  if (open < 0) return text;
  const selectors = text.slice(0, open).split(',').map(remapSelector);
  return `${selectors.join(', ')} ${text.slice(open)}`;
}

function prefixRule(rule) {
  const text = rule.cssText.trimStart();
  const cssText = text.startsWith('@') ? rule.cssText : prefixSelector(rule.cssText);
  if (!rule.cssRules?.length) return cssText;
  const head = cssText.slice(0, cssText.indexOf('{') + 1);
  const tail = cssText.slice(cssText.lastIndexOf('}'));
  return head + [...rule.cssRules].map(prefixRule).join('') + tail;
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
    for (const rule of rules) css += `${prefixRule(rule)}\n`;
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

// An SVG document has no access to the page's font faces, so the text would fall back to a wider system font and
// the PNG would not match the screen. Only the families in use are embedded, and the result is cached.
let fontCssPromise = null;

function fontSelector(descriptor) {
  const family = descriptor.family.replaceAll('"', "'");
  const weight = descriptor.weight || 'normal';
  const style = descriptor.style || 'normal';
  return `${style} ${weight} 16px "${descriptor.family.replaceAll('"', '')}"`;
}

async function dataUrlOf(href) {
  const blob = await fetchImageBlob(href).catch(() => null);
  if (!blob) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

async function embedFonts() {
  fontCssPromise ??= (async () => {
    const families = new Set([
      getComputedStyle(document.body).fontFamily,
      getComputedStyle(document.documentElement).getPropertyValue('--font-post'),
    ].flatMap((value) => value.split(',').map((name) => name.trim().replace(/^['"]|['"]$/g, '').toLowerCase())));
    const faces = [];
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of rules) {
        if (rule.type !== CSSRule.FONT_FACE_RULE) continue;
        const family = rule.style.getPropertyValue('font-family').trim();
        if (!families.has(family.replace(/^['"]|['"]$/g, '').toLowerCase())) continue;
        const src = rule.style.getPropertyValue('src').match(/url\(["']?([^"')]+)["']?\)/);
        if (!src) continue;
        faces.push({ src: src[1], weight: rule.style.getPropertyValue('font-weight').trim(), style: rule.style.getPropertyValue('font-style').trim(), family, display: rule.style.getPropertyValue('font-display').trim() });
      }
    }
    // Warm each face so the browser has the file before it is turned into a data URL.
    await Promise.all(faces.map((face) => document.fonts.load(fontSelector({ family: face.family, weight: face.weight, style: face.style })).catch(() => null)));
    const blocks = await Promise.all(faces.map(async (face) => {
      const url = new URL(face.src, document.baseURI).href;
      const data = await dataUrlOf(url);
      if (!data) return '';
      return `@font-face{font-family:${face.family};src:url(${data});font-weight:${face.weight || 'normal'};font-style:${face.style || 'normal'};font-display:${face.display || 'swap'}}`;
    }));
    return blocks.join('\n');
  })();
  try {
    return await fontCssPromise;
  } catch {
    // A missing font costs fidelity, not the capture.
    return '';
  }
}

function buildSheet(threadName, postNode, width) {
  const root = document.documentElement;
  const { ui, post } = scaleTokens();
  // A plain wrapper is easier to measure and keeps the title above the post. It mirrors the live <html> so
  // every `:root`-scoped rule resolves exactly as it does on screen.
  const holder = document.createElement('div');
  holder.className = 'screenshot-sheet';
  for (const name of ['theme', 'font']) {
    if (root.dataset[name]) holder.dataset[name] = root.dataset[name];
  }
  holder.style.width = `${width}px`;
  holder.style.setProperty('--ui-scale', String(ui));
  holder.style.setProperty('--post-scale', String(post));
  const heading = document.createElement('div');
  heading.className = 'screenshot-title';
  heading.textContent = threadName;
  holder.append(heading, postNode);
  return holder;
}

function rasterize(node, fonts = '') {
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
  const style = `<style>${fonts}\n${inlineStyles()}</style>`;
  const markup = new XMLSerializer().serializeToString(clone);
  // Firefox lays the title out slightly shorter than the DOM measurement, so the sheet can end a few dozen pixels
  // above the bottom of the bitmap. The outer wrapper carries the same theme attributes as the sheet, so that
  // leftover strip is drawn in the page colour instead of the default light one.
  const theme = node.dataset.theme ? ` data-theme="${node.dataset.theme}"` : '';
  const font = node.dataset.font ? ` data-font="${node.dataset.font}"` : '';
  const sheetBg = getComputedStyle(node).backgroundColor;
  const scaleVars = `--ui-scale:${getComputedStyle(node).getPropertyValue('--ui-scale') || 1};--post-scale:${getComputedStyle(node).getPropertyValue('--post-scale') || 1};`;
  // `viewBox` keeps the layout in CSS pixels while width/height apply the scale, so text wraps identically at
  // any ratio.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${outWidth}" height="${outHeight}" viewBox="0 0 ${width} ${height}">` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml"${theme}${font} style="width:${width}px;min-height:${height}px;${scaleVars}background:${sheetBg}">${style}${markup}</div>` +
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
      // Any sub-pixel row the SVG leaves unpainted must read as the sheet, not as transparency.
      context.fillStyle = sheetBg;
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
  try {
    const source = article.cloneNode(true);
    source.querySelectorAll(`.${BUTTON_CLASS}`).forEach((n) => n.remove());
    // The clone is measured off-screen, then rasterised; it never becomes visible.
    const width = layoutWidth(article);
    const sheet = buildSheet(threadTitle(), source, width);
    sheet.style.position = 'fixed';
    sheet.style.left = '-100000px';
    sheet.style.top = '0';
    document.body.append(sheet);
    try {
      pruneUnloadedReactionStrips(sheet);
      const fonts = await embedFonts();
      await inlineImages(sheet);
      const png = await rasterize(sheet, fonts);
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
