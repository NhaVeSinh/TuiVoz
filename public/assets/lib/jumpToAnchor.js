/** Anchor scroll. */

import { revealFilteredBlock } from '../filters/apply.js';

const USER_SCROLL_TOLERANCE = 2;
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

export function jumpToAnchor(id, { settleMs = 1200, imageMs = 3000 } = {}) {
  const el = document.getElementById(id);
  if (!el) return false;

  // A hidden-post permalink lands on the placeholder; reveal first.
  revealFilteredBlock(el);

  const scrollPadding = () => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  // Anchor's target top, in document coords.
  const targetY = () => window.scrollY + el.getBoundingClientRect().top - scrollPadding();

  let expectedY = targetY();
  let userMoved = false;

  const place = () => {
    expectedY = targetY();
    el.scrollIntoView({ block: 'start' });
    // Edge clamping can shift the real position.
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

  // Late-loading images shift the anchor; bounded by imageMs.
  const onLoad = () => {
    if (userMoved || !el.isConnected || Date.now() - startedAt > imageMs) return;
    place();
  };
  for (const img of document.querySelectorAll('.message--post img')) {
    if (!img.complete) img.addEventListener('load', onLoad, { once: true, passive: true });
  }

  return true;
}
