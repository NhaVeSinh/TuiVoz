// The popup behind a post's `#13,661` number: the canonical voz.vn permalink and the permalink of the site
// being browsed. Not a modal — the number keeps its jump behaviour.

import { esc } from '../core/utils.js';
import { threadPath, withPage } from '../core/paths.js';
import { toast } from './feedback.js';

// `voz.vn` is the upstream forum, independent of where this client is deployed.
const VOZ_ORIGIN = 'https://voz.vn';

// voz.vn's canonical permalink. XenForo resolves /t/<slug>.<id>/post-<postId> server-side, so the page number
// is not guessed here.
export function vozPostUrl(thread, postId) {
  if (!thread?.thread_id || !postId) return '';
  // `threadPath` already produces the slugged form.
  return `${VOZ_ORIGIN}${threadPath(thread).replace(/\/$/, '')}/post-${postId}`;
}

// The permalink as the reader sees it: current origin, current page, `#post-…` fragment.
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
    // Falls through to the legacy path: clipboard access needs a secure context.
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

// The number is also the permalink of its own post, so the same click opens the menu *and* scrolls the page to
// that post. That programmatic scroll used to close the menu immediately — measured as
// `doc-click → popup add → popup remove → scroll`. Inside this window a scroll only re-anchors the menu.
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

// Anchored below the number and kept inside the viewport. Fixed so it escapes the post's stacking context.
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
  // Still settling from the anchor jump this click caused: follow the number instead of dying.
  if (performance.now() - open.openedAt < JUMP_GRACE_MS) {
    place();
    return;
  }
  closePostNumberPopup();
}

function onUserScroll() {
  closePostNumberPopup();
}

// The post list is replaced by innerHTML on some navigations, detaching the trigger with no event to listen
// for. Closing on every render would kill the popup the same click opened.
function watchTrigger() {
  cancelAnimationFrame(watchRaf);
  const tick = () => {
    if (!open) return;
    if (!open.trigger.isConnected) return closePostNumberPopup();
    // The anchor jump moves the number under the menu; keep the menu attached to it until it settles.
    if (performance.now() - open.openedAt < JUMP_GRACE_MS) place();
    watchRaf = requestAnimationFrame(tick);
  };
  watchRaf = requestAnimationFrame(tick);
}

// A click on the trigger is a no-op here: the `thread` handler owns toggling, so a second click can close it.
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
  // A click on the same number while its menu is open closes it.
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

  // Registered on the next task: a capture listener added mid-gesture would run for the opening click and close
  // the menu immediately.
  setTimeout(() => {
    if (!open || open.trigger !== trigger) return;
    document.addEventListener('click', onDocumentClick, true);
    document.addEventListener('keydown', onKeydown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', closePostNumberPopup, true);
    // A wheel or touch is unambiguously the reader scrolling, so it closes at once even inside the grace window.
    window.addEventListener('wheel', onUserScroll, { capture: true, passive: true });
    window.addEventListener('touchmove', onUserScroll, { capture: true, passive: true });
  }, 0);

  root.querySelector('.post-share-option')?.focus();
}
