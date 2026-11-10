// Continuous scrolling for thread lists and threads (Cài đặt → Hệ thống): on appends at the bottom, manual
// only after the pager button, off is pager only. Pages are appended, not re-rendered.

import { app } from '../core/dom.js';
import { getInfiniteScroll } from '../lib/settings.js';

let current = null;
let stopButton = null;
// Scroll-direction reveal state for the floating stop button.
let lastY = 0;
const REVEAL_THRESHOLD = 8;

// `render` receives a page number and the node(s) to append into, and returns `{ count }`.
export function mountInfiniteScroll(options) {
  teardownInfiniteScroll();
  const mode = getInfiniteScroll();
  if (mode === 'off') return teardownInfiniteScroll;

  const { makeHref, lastPage, currentPage, insert, fetchPage, onPageAppended } = options;
  if (!lastPage || lastPage <= 1 || currentPage >= lastPage) return teardownInfiniteScroll;

  const sentinel = document.createElement('div');
  sentinel.className = 'infinite-sentinel';
  sentinel.setAttribute('role', 'status');
  sentinel.setAttribute('aria-live', 'polite');
  sentinel.innerHTML = '<span class="infinite-status"></span>';

  const state = {
    mode,
    armed: mode === 'on', // "manual" stays unarmed until the user clicks the pager button
    page: currentPage,
    lastPage,
    busy: false,
    failed: null,
    sentinel,
    makeHref,
    fetchPage,
    insert,
    onPageAppended,
  };
  current = state;

  const label = () => {
    if (state.failed) return `Không tải được trang ${state.page + 1}. `;
    if (state.busy) return `Đang tải trang ${state.page + 1}…`;
    return `Trang ${state.page + 1} / ${state.lastPage}`;
  };
  state.refreshLabel = () => {
    const status = sentinel.querySelector('.infinite-status');
    if (status) status.textContent = label();
    sentinel.dataset.state = state.failed ? 'error' : state.busy ? 'busy' : 'idle';
  };

  const loadNext = async () => {
    if (state.busy || state.failed || !state.armed || state.page >= state.lastPage) return;
    state.busy = true;
    state.refreshLabel();
    const target = state.page + 1;
    try {
      const res = await state.fetchPage(target);
      if (current !== state) return;
      const count = await state.insert(target, res);
      if (current !== state) return;
      if (!count) {
        // A page with nothing to show: stop instead of looping.
        state.page = state.lastPage;
        state.refreshLabel();
        return;
      }
      state.page = target;
      try {
        history.replaceState(null, '', `${state.makeHref(target)}${location.hash}`);
      } catch {
        /* replaceState can fail on a stale entry; the URL is cosmetic here. */
      }
      state.onPageAppended?.(target, res);
      state.refreshLabel();
      if (state.page >= state.lastPage) teardownInfiniteScroll();
    } catch (error) {
      if (current !== state) return;
      state.failed = error;
      state.refreshLabel();
    } finally {
      if (current === state) {
        state.busy = false;
        state.refreshLabel();
      }
    }
  };

  // A user gesture is required first, so a tall window does not chain-load on open.
  let allow = false;
  const firstGesture = () => {
    allow = true;
    window.removeEventListener('scroll', firstGesture);
    window.removeEventListener('touchmove', firstGesture);
    window.removeEventListener('wheel', firstGesture);
  };
  window.addEventListener('scroll', firstGesture, { passive: true, once: true });
  window.addEventListener('touchmove', firstGesture, { passive: true, once: true });
  window.addEventListener('wheel', firstGesture, { passive: true, once: true });

  const observer = new IntersectionObserver(
    (entries) => {
      if (!allow || !state.armed || state.busy || state.failed) return;
      if (!entries.some((entry) => entry.isIntersecting)) return;
      loadNext();
    },
    { rootMargin: '400px 0px' }
  );

  // Sits after the pager so the status reads as "more below".
  if (options.after?.parentNode) options.after.insertAdjacentElement('afterend', sentinel);
  else app.append(sentinel);
  state.observer = observer;
  state.allow = () => { allow = true; };
  state.loadNow = () => loadNext();
  observer.observe(sentinel);
  state.refreshLabel();
  // "on" starts armed, so the stop control appears with it.
  if (state.armed) showStopButton();

  return state;
}

// Arms the current page: used by the pager button in "manual" mode.
export function armInfiniteScroll() {
  if (!current) return false;
  current.armed = true;
  current.allow?.();
  showStopButton();
  // The observer only fires on a change; load now if the sentinel is already on screen.
  current.sentinel.scrollIntoView({ block: 'nearest' });
  if (current.sentinel.getBoundingClientRect().top < innerHeight) current.loadNow?.();
  return true;
}

// Turning continuous scrolling off without leaving the page: the observer stops and the appended pages stay
// put, so the reader keeps their place.
export function disarmInfiniteScroll() {
  if (!current) return false;
  current.armed = false;
  hideStopButton();
  return true;
}

// Floating "stop continuous scroll" control, outside the pager so it stays reachable while the list grows.
// Present only while scrolling is armed, and it slides away on scroll down.
function showStopButton() {
  if (!current || !current.armed) return;
  if (stopButton) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'infinite-stop';
  btn.innerHTML = '<span aria-hidden="true">✕</span>';
  btn.title = 'Dừng cuộn liên tục';
  btn.setAttribute('aria-label', 'Dừng cuộn liên tục');
  btn.addEventListener('click', () => {
    disarmInfiniteScroll();
    // The pager's arm button mirrors this state, so hand it back to idle.
    for (const armBtn of app.querySelectorAll('[data-scroll-arm]')) {
      armBtn.disabled = false;
      armBtn.classList.remove('is-active');
      armBtn.title = 'Bật cuộn liên tục cho trang này';
      armBtn.setAttribute('aria-label', 'Bật cuộn liên tục cho trang này');
      armBtn.innerHTML = '<span class="pageNav-scrollIcon" aria-hidden="true">⇣</span>';
    }
  });
  app.append(btn);
  stopButton = btn;
  lastY = window.scrollY;
  window.addEventListener('scroll', onScrollDirection, { passive: true });
}

// Scroll-direction reveal. The threshold keeps a jittery trackpad from flickering the button.
function onScrollDirection() {
  if (!stopButton) return;
  const y = window.scrollY;
  const delta = y - lastY;
  if (Math.abs(delta) < REVEAL_THRESHOLD) return;
  // Hide only when going down with something above, so it stays visible at the top.
  stopButton.classList.toggle('is-hidden', delta > 0 && y > REVEAL_THRESHOLD);
  lastY = y;
}

function hideStopButton() {
  window.removeEventListener('scroll', onScrollDirection);
  stopButton?.remove();
  stopButton = null;
}

export function teardownInfiniteScroll({ keepSentinel = false } = {}) {
  hideStopButton();
  if (!current) return;
  current.observer?.disconnect();
  // A navigation keeps the sentinel: it is 38px of document height, and dropping it before the next view has
  // written its markup shortens the document mid-navigation, so the browser clamps scrollY and the list jumps up
  // before the thread appears. The next `app.innerHTML` removes it in the same task.
  if (!keepSentinel) current.sentinel?.remove();
  current = null;
}

export function infiniteScrollActive() {
  return Boolean(current);
}

export function infiniteScrollMode() {
  return getInfiniteScroll();
}
