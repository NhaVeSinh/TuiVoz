/** Post-number popup. */

import { esc } from '../core/utils.js';
import { threadPath, withPage } from '../core/paths.js';
import { toast } from './feedback.js';

// Upstream forum origin, independent of this client's host.
const VOZ_ORIGIN = 'https://voz.vn';

// Canonical voz permalink; XenForo resolves /post-<id> server-side.
export function vozPostUrl(thread, postId) {
  if (!thread?.thread_id || !postId) return '';
  // threadPath already produces the slugged form.
  return `${VOZ_ORIGIN}${threadPath(thread).replace(/\/$/, '')}/post-${postId}`;
}

// Permalink as the reader sees it: current origin and page.
export function webPostUrl(thread, page, postId) {
  if (!thread?.thread_id || !postId) return '';
  return `${location.origin}${withPage(threadPath(thread), page)}#post-${postId}`;
}

async function copy(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Legacy path: clipboard API needs a secure context.
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

let open = null;
let watchRaf = 0;

// The same click scrolls to the post; inside this window scrolls only re-anchor the menu.
const JUMP_GRACE_MS = 700;

export function closePostNumberPopup() {
  if (watchRaf) {
    cancelAnimationFrame(watchRaf);
    watchRaf = 0;
  }
  if (!open) return;
  open.root.remove();
  open.trigger.setAttribute('aria-expanded', 'false');
  open = null;
  document.removeEventListener('click', onDocumentClick, true);
  document.removeEventListener('keydown', onKeydown, true);
  window.removeEventListener('scroll', onScroll, true);
  window.removeEventListener('resize', closePostNumberPopup, true);
  window.removeEventListener('wheel', onUserScroll, { capture: true });
  window.removeEventListener('touchmove', onUserScroll, { capture: true });
}

// Anchored below the number; fixed to escape the post's stacking context.
function place() {
  if (!open) return;
  const { root, trigger } = open;
  const rect = trigger.getBoundingClientRect();
  const width = root.offsetWidth;
  const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
  root.style.left = `${left}px`;
  root.style.top = `${rect.bottom + 6}px`;
}

function onScroll() {
  if (!open) return;
  // Still settling from the anchor jump: re-anchor, don't close.
  if (performance.now() - open.openedAt < JUMP_GRACE_MS) {
    place();
    return;
  }
  closePostNumberPopup();
}

function onUserScroll() {
  closePostNumberPopup();
}

// innerHTML swaps detach the trigger silently; close only once it is gone.
function watchTrigger() {
  cancelAnimationFrame(watchRaf);
  const tick = () => {
    if (!open) return;
    if (!open.trigger.isConnected) return closePostNumberPopup();
    // Keep the menu attached until the anchor jump settles.
    if (performance.now() - open.openedAt < JUMP_GRACE_MS) place();
    watchRaf = requestAnimationFrame(tick);
  };
  watchRaf = requestAnimationFrame(tick);
}

// Trigger clicks no-op here; the thread handler owns toggling.
function onDocumentClick(event) {
  if (!open) return;
  if (open.root.contains(event.target) || open.trigger.contains(event.target)) return;
  closePostNumberPopup();
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    const trigger = open?.trigger;
    closePostNumberPopup();
    trigger?.focus();
  }
}

export function openPostNumberPopup(trigger, thread, page, postId) {
  // Re-clicking the same number closes its menu.
  const wasOpen = open?.trigger === trigger;
  closePostNumberPopup();
  if (wasOpen) return;

  const links = [
    { label: 'Sao chép liên kết voz.vn', url: vozPostUrl(thread, postId) },
    { label: 'Sao chép liên kết web', url: webPostUrl(thread, page, postId) },
  ].filter((item) => item.url);

  const root = document.createElement('div');
  root.className = 'post-share-popup';
  root.setAttribute('role', 'menu');
  root.innerHTML = links
    .map(
      (item, index) =>
        `<button type="button" class="post-share-option" role="menuitem" data-index="${index}" title="${esc(item.url)}">${esc(item.label)}</button>`
    )
    .join('');
  document.body.append(root);
  place();

  trigger.setAttribute('aria-expanded', 'true');
  open = { root, trigger, openedAt: performance.now() };
  watchTrigger();
  place();

  root.addEventListener('click', async (event) => {
    const option = event.target.closest('.post-share-option');
    if (!option) return;
    event.preventDefault();
    const item = links[Number(option.dataset.index)];
    const ok = await copy(item.url);
    toast(ok ? 'Đã sao chép liên kết' : 'Không sao chép được liên kết', !ok);
    if (ok) closePostNumberPopup();
  });

  // Next task: a capture listener added mid-gesture would see the opening click.
  setTimeout(() => {
    if (!open || open.trigger !== trigger) return;
    document.addEventListener('click', onDocumentClick, true);
    document.addEventListener('keydown', onKeydown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', closePostNumberPopup, true);
    // Wheel/touch means a real user scroll: close even inside the grace window.
    window.addEventListener('wheel', onUserScroll, { capture: true, passive: true });
    window.addEventListener('touchmove', onUserScroll, { capture: true, passive: true });
  }, 0);

  root.querySelector('.post-share-option')?.focus();
}
