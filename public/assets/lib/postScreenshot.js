/** Post screenshot PNG. */

import { toast } from '../ui/feedback.js';
import { getPostScreenshot, getFontScale, normalizeFontScale } from './settings.js';
import { resolveAttachment, fetchImageBlob } from './imageDownload.js';
import { pruneUnloadedReactionStrips } from '../ui/reactions.js';

const BUTTON_CLASS = 'post-screenshot-button';
const ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 13 4 4 10-10"/></svg>';

// 2x for sharp text; scale drops until the bitmap fits instead of clipping.
const SCALE = 2;
const MAX_PIXELS = 40_000_000;
// Firefox caps foreignObject height at its coordinate space.
const MAX_HEIGHT = 16000;

// Sheet width must be the post's real on-screen width or rules like
// `max-width: 400px` won't match; cap only very wide windows.
const MAX_SHEET_WIDTH = 1000;
function layoutWidth(article) {
  const measured = Math.round(article.getBoundingClientRect().width);
  return Math.min(measured || document.documentElement.clientWidth, MAX_SHEET_WIDTH);
}

// Carry the reader's text size into the PNG.
function scaleTokens() {
  const { uiSize, postSize } = getFontScale();
  return { ui: normalizeFontScale(uiSize) / 100, post: normalizeFontScale(postSize) / 100 };
}

// Page heading (#thread-title or #conversation-title), else document.title.
function threadTitle() {
  const el = document.getElementById('thread-title') || document.getElementById('conversation-title');
  if (!el) return (document.title || '').replace(/\s*\|\s*VOZ\s*$/, '');
  // Strip the prefix badge; only the title text is wanted.
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.label, .labelLink, .prefix').forEach((n) => n.remove());
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

// Firefox never matches `html` or `:root[data-theme]` inside foreignObject;
// re-anchor those selectors on the sheet wrapper (same data attributes).
const ROOT_AT = /(^|[\s,>+~])(?::root|html)(?![-\w])/;

function remapSelector(selector) {
  const trimmed = selector.trim();
  const match = ROOT_AT.exec(trimmed);
  if (!match) return trimmed;
  const after = trimmed.slice(match.index + match[0].length).trim();
  // Rule styles the document root itself; keep it on `:root`.
  if (after === '') return match[1] + ':root' + trimmed.slice(match.index + match[0].length);
  return trimmed.slice(0, match.index) + match[1] + after;
}

function prefixSelector(text) {
  const open = text.indexOf('{');
  if (open < 0) return text;
  const selectors = text.slice(0, open).split(',').map(remapSelector);
  return `${selectors.join(', ')} ${text.slice(open)}`;
}

function serializeRule(rule, width) {
  if (rule.type === CSSRule.MEDIA_RULE) {
    const query = rule.conditionText || rule.media?.mediaText || '';
    // Evaluate width queries against the sheet's own width.
    const body = [...rule.cssRules].map((child) => serializeRule(child, width)).join('');
    return queryMatches(query, width) ? body : '';
  }
  const text = rule.cssText.trimStart();
  const cssText = text.startsWith('@') ? rule.cssText : prefixSelector(rule.cssText);
  if (!rule.cssRules?.length) return cssText;
  const head = cssText.slice(0, cssText.indexOf('{') + 1);
  const tail = cssText.slice(cssText.lastIndexOf('}'));
  return head + [...rule.cssRules].map((child) => serializeRule(child, width)).join('') + tail;
}

// Media queries inside foreignObject see the SVG viewport, not the sheet
// width, so mobile `max-width` rules never fire. Flatten them at build time.
function widthMatches(query, width) {
  const min = query.match(/min-width:\s*([\d.]+)px/);
  const max = query.match(/max-width:\s*([\d.]+)px/);
  if (!min && !max) return null;
  if (min && width < Number(min[1])) return false;
  if (max && width > Number(max[1])) return false;
  return true;
}

function queryMatches(query, width) {
  // Comma is `or`: one matching branch is enough.
  for (const part of query.split(',')) {
    const text = part.trim();
    const byWidth = widthMatches(text, width);
    if (byWidth === false) continue;
    // pointer/hover etc. are unknowable here; keep the block.
    if (byWidth === null && !/^all$/.test(text)) return true;
    if (byWidth === true) return true;
  }
  return false;
}

function inlineStyles(width) {
  let css = '';
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      // Cross-origin sheets throw; skip them (fonts already loaded).
      continue;
    }
    for (const rule of rules) css += `${serializeRule(rule, width)}\n`;
  }
  return css;
}

// Re-encode via the proxy to keep the canvas untainted; drop unreadable images.
async function toDataUrl(img) {
  const url = img.currentSrc || img.src || '';
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  // Resolve attachments first: the short form is a redirect Cloudflare often challenges.
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

// SVG can't reach the page's fonts; embed the families in use (cached).
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
    // Warm each face so the browser has the file first.
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
    // Missing font costs fidelity, not the capture.
    return '';
  }
}

function buildSheet(threadName, postNode, width) {
  const root = document.documentElement;
  const { ui, post } = scaleTokens();
  // Wrapper mirrors the live <html> so `:root`-scoped rules resolve as on screen.
  const holder = document.createElement('div');
  holder.className = 'screenshot-sheet';
  for (const name of ['theme', 'themeMode', 'font']) {
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

// Wait for inlined images to decode before measuring, or the bitmap is
// sized too short. Broken images fire no events and stalled fetches hang,
// so every wait is bounded.
const SETTLE_MS = 15000;

function settle(node) {
  const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const bounded = (promise) => Promise.race([promise, new Promise((resolve) => setTimeout(resolve, SETTLE_MS))]);
  const images = [...node.querySelectorAll('img')].map((img) => {
    const decode = () => img.decode?.().catch(() => {}) ?? Promise.resolve();
    if (img.complete) return bounded(decode());
    return bounded(new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    }).then(decode));
  });
  return Promise.all([...images.map(bounded), frames(), frames()]);
}

// SVG lays the sheet out shorter than the DOM predicts, leaving a uniform
// backdrop tail; cut below the last content row, keeping bottom padding.
function trimTail(canvas, context, width, background, scale = SCALE) {
  const height = canvas.height;
  const grab = (y) => context.getImageData(0, y, width, 1).data;
  const probe = new Uint8ClampedArray(grab(0));
  const baseline = /^#?[0-9a-f]{6}$/i.test(background) ? background.replace('#', '') : null;
  const bg = baseline
    ? [parseInt(baseline.slice(0, 2), 16), parseInt(baseline.slice(2, 4), 16), parseInt(baseline.slice(4, 6), 16)]
    : null;
  const isBackdrop = (data) => {
    for (let x = 0; x < width * 4; x += 8) {
      if (!bg) {
        if (Math.abs(data[x] - probe[x]) > 4 || Math.abs(data[x + 1] - probe[x + 1]) > 4) return false;
        continue;
      }
      if (Math.abs(data[x] - bg[0]) > 4 || Math.abs(data[x + 1] - bg[1]) > 4 || Math.abs(data[x + 2] - bg[2]) > 4) return false;
    }
    return true;
  };
  let last = height - 1;
  while (last > 0 && isBackdrop(grab(last))) last -= 1;
  // Add back the sheet's 16px bottom padding.
  return Math.min(height, last + Math.ceil(16 * scale) + 2);
}

function crop(canvas, width, height) {
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  out.getContext('2d').drawImage(canvas, 0, 0, width, height, 0, 0, width, height);
  return out;
}

function rasterize(node, fonts = '') {
  const width = Math.ceil(node.scrollWidth || node.getBoundingClientRect().width);
  // Fixed-position sheet shrink-wraps: use last child's bottom edge plus
  // its margin for the real content height.
  const rect = node.getBoundingClientRect();
  const last = node.lastElementChild;
  const contentHeight = last
    ? Math.ceil(last.getBoundingClientRect().bottom - rect.top + (parseFloat(getComputedStyle(last).marginBottom) || 0))
    : Math.ceil(node.scrollHeight || rect.height);
  const height = Math.max(Math.ceil(node.scrollHeight || 0), contentHeight, 1);
  // Shrink the pixel ratio rather than cropping.
  let scale = SCALE;
  if (height * scale > MAX_HEIGHT) scale = MAX_HEIGHT / height;
  while (width * scale * (height * scale) > MAX_PIXELS && scale > 0.5) scale -= 0.1;
  const outWidth = Math.max(1, Math.round(width * scale));
  const outHeight = Math.max(1, Math.round(height * scale));

  // Strip the off-screen park position, or the SVG renders blank.
  const clone = node.cloneNode(true);
  clone.style.position = 'static';
  clone.style.left = 'auto';
  clone.style.top = 'auto';
  clone.style.width = `${width}px`;
  const style = `<style>${fonts}\n${inlineStyles(width)}</style>`;
  const markup = new XMLSerializer().serializeToString(clone);
  // Firefox leaves a strip below the sheet; theme the outer wrapper so
  // it paints in the page colour, not the default light one.
  const theme = node.dataset.theme ? ` data-theme="${node.dataset.theme}"` : '';
  // Catppuccin palettes key off data-theme-mode.
  const themeMode = node.dataset.themeMode ? ` data-theme-mode="${node.dataset.themeMode}"` : '';
  const font = node.dataset.font ? ` data-font="${node.dataset.font}"` : '';
  const sheetBg = getComputedStyle(node).backgroundColor;
  const scaleVars = `--ui-scale:${getComputedStyle(node).getPropertyValue('--ui-scale') || 1};--post-scale:${getComputedStyle(node).getPropertyValue('--post-scale') || 1};`;
  // viewBox keeps layout in CSS pixels so text wraps identically at any scale.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${outWidth}" height="${outHeight}" viewBox="0 0 ${width} ${height}">` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml"${theme}${themeMode}${font} style="width:${width}px;min-height:${height}px;${scaleVars}background:${sheetBg}">${style}${markup}</div>` +
    '</foreignObject></svg>';

  // blob: URLs taint the canvas in Chrome; data: stays same-document
  // (a few MB is under Chrome's data: URL limit).
  const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = outWidth;
      canvas.height = outHeight;
      const context = canvas.getContext('2d');
      // Sub-pixel unpainted rows must read as the sheet, not transparency.
      context.fillStyle = sheetBg;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, outWidth, outHeight);
      try {
        // Firefox draws the sheet shorter than the allocated bitmap; trim
        // the uniform tail. Chrome may throw SecurityError; untrimmed is usable.
        let final = canvas;
        try {
          const trimmed = trimTail(canvas, context, outWidth, sheetBg, scale);
          if (trimmed !== outHeight) final = crop(canvas, outWidth, trimmed);
        } catch {
          // Use the untrimmed canvas.
        }
        final.toBlob((png) => (png ? resolve(png) : reject(new Error('Không tạo được ảnh PNG.'))), 'image/png');
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Không xuất được ảnh bài viết.'));
      }
    };
    image.onerror = () => reject(new Error('Không dựng được ảnh bài viết.'));
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
  // Firefox reads the blob lazily; revoking now would cancel the save.
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

function fileName(article) {
  const kind = article.dataset.messageId ? 'dm' : 'post';
  const id = article.dataset.messageId || article.dataset.postId || 'unknown';
  return `voz-${kind}-${id}.png`;
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

// Render the post to a PNG blob without saving; caller decides its fate.
async function renderPostPng(article) {
  const source = article.cloneNode(true);
  source.querySelectorAll(`.${BUTTON_CLASS}`).forEach((n) => n.remove());
  // Clone is measured and rasterised off-screen; never visible.
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
    // Inlining swaps every src; layout is final only after they decode.
    await settle(sheet);
    return await rasterize(sheet, fonts);
  } finally {
    sheet.remove();
  }
}

async function copyPng(png) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
  } catch {
    return false;
  }
}

// Share the PNG via Web Share Level 2. Status: 'shared', 'cancelled',
// 'unsupported'; `error` carries the exception name for diagnostics.
async function sharePng(png, name) {
  if (!navigator.share) return { status: 'unsupported', error: 'no navigator.share' };
  const file = new File([png], name, { type: 'image/png' });
  if (navigator.canShare && !navigator.canShare({ files: [file] })) return { status: 'unsupported', error: 'canShare=false' };
  try {
    await navigator.share({ files: [file] });
    return { status: 'shared' };
  } catch (error) {
    return { status: error?.name === 'AbortError' ? 'cancelled' : 'unsupported', error: error?.name || String(error) };
  }
}

// Fallback when files can't be shared (Firefox Android only accepts
// url/text): share the post's permalink. Status: 'url', 'cancelled', 'unsupported'.
async function shareUrl(article) {
  if (!navigator.share) return { status: 'unsupported', error: 'no navigator.share' };
  const url = shareableUrl(article);
  const title = threadTitle();
  const data = { title, text: title, url };
  if (navigator.canShare && !navigator.canShare(data)) return { status: 'unsupported', error: 'canShare(url)=false' };
  try {
    await navigator.share(data);
    return { status: 'url' };
  } catch (error) {
    return { status: error?.name === 'AbortError' ? 'cancelled' : 'unsupported', error: error?.name || String(error) };
  }
}

// Link offered when the PNG can't be shared; messages have no public
// URL, so use the current page.
function shareableUrl(article) {
  const postId = article.dataset.postId;
  if (postId) return `https://voz.vn/posts/${postId}/`;
  return location.href;
}

async function copyText(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Legacy path: clipboard access needs a secure context.
  }
  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.top = '-1000px';
    document.body.append(field);
    field.select();
    const ok = document.execCommand('copy');
    field.remove();
    return ok;
  } catch {
    return false;
  }
}

// Share menu behind the camera button; owns its dismiss wiring and
// self-closes after a successful action.
let menu = null;

function closeScreenshotMenu() {
  if (!menu) return;
  menu.root.remove();
  menu.trigger.setAttribute('aria-expanded', 'false');
  menu = null;
  document.removeEventListener('click', onMenuDocumentClick, true);
  document.removeEventListener('keydown', onMenuKeydown, true);
  window.removeEventListener('resize', closeScreenshotMenu, true);
  window.removeEventListener('wheel', closeScreenshotMenu, { capture: true });
  window.removeEventListener('touchmove', closeScreenshotMenu, { capture: true });
}

function onMenuDocumentClick(event) {
  if (!menu) return;
  if (menu.root.contains(event.target) || menu.trigger.contains(event.target)) return;
  closeScreenshotMenu();
}

function onMenuKeydown(event) {
  if (event.key === 'Escape') {
    const trigger = menu?.trigger;
    closeScreenshotMenu();
    trigger?.focus();
  }
}

function placeMenu() {
  if (!menu) return;
  const rect = menu.trigger.getBoundingClientRect();
  const width = menu.root.offsetWidth;
  const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
  menu.root.style.left = `${left}px`;
  menu.root.style.top = `${rect.bottom + 6}px`;
}

function openScreenshotMenu(trigger, article, png, noun) {
  closeScreenshotMenu();
  const name = fileName(article);
  const actions = [
    {
      label: 'Sao chép vào bộ nhớ tạm',
      async run() {
        const ok = await copyPng(png);
        toast(ok ? 'Đã sao chép ảnh.' : 'Trình duyệt không cho sao chép ảnh.', !ok);
        return ok;
      },
    },
    {
      label: 'Chia sẻ',
      async run() {
        const fileResult = await sharePng(png, name);
        if (fileResult.status === 'shared') return true;
        if (fileResult.status === 'cancelled') return true;
        const urlResult = await shareUrl(article);
        if (urlResult.status === 'url') {
          toast('Trình duyệt không chia sẻ được ảnh — đang chia sẻ liên kết bài viết.');
          return true;
        }
        if (urlResult.status === 'cancelled') return true;
        // Nothing shareable: fall back to downloading the image.
        triggerDownload(png, name);
        const copied = await copyText(shareableUrl(article));
        const reason = `${fileResult.error || ''}${urlResult.error ? ` / ${urlResult.error}` : ''}`;
        toast(copied ? `Không chia sẻ được (${reason}) — đã tải ảnh và sao chép liên kết.` : `Không chia sẻ được (${reason}) — đã tải ảnh.`, true);
        return true;
      },
    },
    {
      label: 'Tải xuống',
      async run() {
        triggerDownload(png, name);
        toast(`Đã lưu ảnh ${noun}.`);
        return true;
      },
    },
  ];
  const root = document.createElement('div');
  root.className = 'post-share-popup';
  root.setAttribute('role', 'menu');
  root.innerHTML = actions
    .map((action, index) => `<button type="button" class="post-share-option" role="menuitem" data-index="${index}">${action.label}</button>`)
    .join('');
  document.body.append(root);
  trigger.setAttribute('aria-expanded', 'true');
  menu = { root, trigger };
  placeMenu();

  root.addEventListener('click', async (event) => {
    const option = event.target.closest('.post-share-option');
    if (!option) return;
    event.preventDefault();
    const done = await actions[Number(option.dataset.index)].run();
    if (done) closeScreenshotMenu();
  });

  setTimeout(() => {
    if (!menu || menu.trigger !== trigger) return;
    document.addEventListener('click', onMenuDocumentClick, true);
    document.addEventListener('keydown', onMenuKeydown, true);
    window.addEventListener('resize', closeScreenshotMenu, true);
    window.addEventListener('wheel', closeScreenshotMenu, { capture: true, passive: true });
    window.addEventListener('touchmove', closeScreenshotMenu, { capture: true, passive: true });
  }, 0);

  root.querySelector('.post-share-option')?.focus();
}

async function capturePost(article, button) {
  if (button.disabled) return;
  button.disabled = true;
  button.classList.add('is-loading');
  const noun = article.dataset.messageId ? 'tin nhắn' : 'bài viết';
  toast(`Đang chụp ${noun}…`);
  try {
    // Bound every stalled step (decode, fonts, proxy) with a timeout toast.
    const png = await Promise.race([
      renderPostPng(article),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Chụp ${noun} quá lâu, thử lại sau.`)), 60_000)),
    ]);
    flashSaved(button);
    openScreenshotMenu(button, article, png, noun);
  } catch (error) {
    toast(error instanceof Error ? error.message : `Không chụp được ${noun}.`, true);
    window.dispatchEvent(new CustomEvent('voz:post-screenshot-error', { detail: error }));
  } finally {
    button.disabled = false;
    button.classList.remove('is-loading');
  }
}

function addControl(article) {
  const list = article.querySelector('.message-attribution-opposite');
  if (!list || article.querySelector(`:scope .${BUTTON_CLASS}`)) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = BUTTON_CLASS;
  const label = article.dataset.messageId ? 'Chụp tin nhắn' : 'Chụp bài viết';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = ICON;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    capturePost(article, button);
  });
  // Before the bookmark so it never covers the post number.
  const item = document.createElement('li');
  item.append(button);
  list.prepend(item);
  article.classList.add('has-screenshot-button');
}

function removeControl(article) {
  const button = article.querySelector(`:scope .${BUTTON_CLASS}`);
  // Remove the wrapping <li> too; an empty one keeps its flex gap.
  const host = button?.closest('.message-attribution-opposite > li') || button;
  host?.remove();
  article.classList.remove('has-screenshot-button');
}

function refresh() {
  const enabled = getPostScreenshot();
  // Thread posts and conversation messages share the same layout.
  for (const article of document.querySelectorAll('#post-list .message--post, .block--conversation .message--conversation')) {
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
  // One body observer covers re-renders and appended pages.
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('voz:settings', schedule);
}
