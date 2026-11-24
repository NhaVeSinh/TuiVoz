/** Auto-hide chrome. */

import { closeHeaderMenus } from './headerMenus.js';

// Matches ui/infiniteScroll.js so a jittery trackpad cannot flicker the bars.
const REVEAL_THRESHOLD = 8;

// Top rubber-band bounces must not read as "scrolled up".
const TOP_SLACK = 4;

let header = null;
let nav = null;
let lastY = 0;
let hidden = false;
let sizeObserver = null;
// Scroll deltas ignored until this timestamp.
let suppressUntil = 0;
// False while the page settles on a fragment; first real scroll re-arms it.
let armed = true;

// Programmatic jumps must not hide the bars.
function suppressBriefly() {
  suppressUntil = performance.now() + 250;
  setHidden(false);
  lastY = window.scrollY;
}

// Re-measured whenever either bar changes size.
function measure() {
  if (!header) return;
  // getBoundingClientRect keeps sub-pixel height; offsetHeight's integer left a 0.5px seam.
  const exact = (el) => Math.round(el.getBoundingClientRect().height * 1000) / 1000;
  const headerH = exact(header);
  const navH = nav ? exact(nav) : 0;
  const root = document.documentElement.style;
  // --header-h parks nav flush under header; --chrome-h is the pair's height.
  root.setProperty('--header-h', `${headerH}px`);
  root.setProperty('--chrome-h', `${Math.round((headerH + navH) * 1000) / 1000}px`);
}

function setHidden(next) {
  if (!header || hidden === next) return;
  hidden = next;
  // A dropdown would float over content once its bar is hidden.
  if (next) closeHeaderMenus();
  document.documentElement.classList.toggle('chrome-hidden', next);
  for (const bar of [header, nav]) bar?.setAttribute('aria-hidden', next ? 'true' : 'false');
}

function onScroll() {
  if (!header) return;
  const y = window.scrollY;
  if (!armed) {
    lastY = y;
    return;
  }
  // Nothing above the top to scroll back to.
  if (y <= TOP_SLACK) {
    setHidden(false);
    lastY = y;
    return;
  }
  // A programmatic jump's big downward delta must not hide the bars.
  if (suppressUntil > performance.now()) {
    lastY = y;
    return;
  }
  const delta = y - lastY;
  if (Math.abs(delta) < REVEAL_THRESHOLD) return;
  setHidden(delta > 0);
  lastY = y;
}

export function wireChromeAutoHide() {
  header = document.querySelector('.p-header');
  nav = document.querySelector('.p-nav');
  if (!header) return;

  measure();
  lastY = window.scrollY;
  setHidden(false);
  // A deep link opens pre-scrolled; ignore deltas until the reader scrolls.
  if (location.hash) armed = false;
  else suppressBriefly();

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', measure, { passive: true });

  // Shortcuts, account block and font swaps change the heights.
  if (typeof ResizeObserver === 'function') {
    sizeObserver = new ResizeObserver(measure);
    sizeObserver.observe(header);
    if (nav) sizeObserver.observe(nav);
  }

  // A jump can land mid-page; keep the bars visible.
    window.addEventListener('hashchange', suppressBriefly);

    // A real gesture re-arms direction tracking.
    const arm = () => {
      armed = true;
      lastY = window.scrollY;
      window.removeEventListener('wheel', arm);
      window.removeEventListener('touchmove', arm);
    };
    window.addEventListener('wheel', arm, { passive: true, once: true });
    window.addEventListener('touchmove', arm, { passive: true, once: true });
}

  // App scrolls (permalink, inline edit, pager) must not read as the reader's.
  export function suppressChromeAutoHide() {
    suppressBriefly();
  }

export function teardownChromeAutoHide() {
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('resize', measure);
  sizeObserver?.disconnect();
  sizeObserver = null;
  armed = true;
  setHidden(false);
  header = null;
  nav = null;
}