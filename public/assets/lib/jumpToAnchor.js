// Land an anchor's top under the sticky bars, then keep it there while late-loading images and lazily-filled
// strips change the layout above it.
//
// The correction must stop the moment the reader scrolls themselves, or a picture that finishes loading seconds
// later yanks the page back to the anchor. Watching only `wheel`/`touchmove` missed every other way of scrolling
// (scrollbar drag, keyboard, trackpad fling, a programmatic scroll), so the position we last set is remembered
// and any scroll away from it counts as the reader taking over.

const USER_SCROLL_TOLERANCE = 2;
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

export function jumpToAnchor(id, { settleMs = 1200, imageMs = 3000 } = {}) {
  const el = document.getElementById(id);
  if (!el) return false;

  const scrollPadding = () => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  // Where the anchor's top should sit, in document coordinates.
  const targetY = () => window.scrollY + el.getBoundingClientRect().top - scrollPadding();

  let expectedY = targetY();
  let userMoved = false;

  const place = () => {
    expectedY = targetY();
    el.scrollIntoView({ block: 'start' });
    // The browser clamps at the document edges, so the real position can differ from the computed one.
    requestAnimationFrame(() => {
      if (!userMoved) expectedY = window.scrollY;
    });
  };

  const onUserInput = () => {
    userMoved = true;
  };
  const onKeyDown = (event) => {
    if (SCROLL_KEYS.has(event.key)) userMoved = true;
  };
  const onScroll = () => {
    if (Math.abs(window.scrollY - expectedY) > USER_SCROLL_TOLERANCE) userMoved = true;
  };

  const cleanup = () => {
    window.removeEventListener('wheel', onUserInput);
    window.removeEventListener('touchmove', onUserInput);
    window.removeEventListener('pointerdown', onUserInput);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('scroll', onScroll);
  };

  window.addEventListener('wheel', onUserInput, { passive: true });
  window.addEventListener('touchmove', onUserInput, { passive: true });
  window.addEventListener('pointerdown', onUserInput, { passive: true });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('scroll', onScroll, { passive: true });

  place();
  const startedAt = Date.now();

  const settle = () => {
    if (userMoved || !el.isConnected) return cleanup();
    if (Math.abs(el.getBoundingClientRect().top - scrollPadding()) > USER_SCROLL_TOLERANCE) place();
    if (Date.now() - startedAt < settleMs) requestAnimationFrame(settle);
    else cleanup();
  };
  requestAnimationFrame(settle);

  // Images above the anchor have no intrinsic size yet, so each one that arrives shifts it. Bounded by `imageMs`:
  // an image that finally loads a minute later must not move a reader who has long since scrolled elsewhere.
  const onLoad = () => {
    if (userMoved || !el.isConnected || Date.now() - startedAt > imageMs) return;
    place();
  };
  for (const img of document.querySelectorAll('.message--post img')) {
    if (!img.complete) img.addEventListener('load', onLoad, { once: true, passive: true });
  }

  return true;
}
