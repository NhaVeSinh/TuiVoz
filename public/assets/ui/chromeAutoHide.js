// Auto-hiding page chrome: the header and nav slide away on scroll down and return on the first upward scroll.
// Hiding is a transform, so the scroll position stays stable.

import { closeHeaderMenus } from './headerMenus.js';

// Same threshold as ui/infiniteScroll.js, so a jittery trackpad cannot flicker the bars.
const REVEAL_THRESHOLD = 8;

// Ignore rubber-band bounces at the top, which would read as "scrolled up".
const TOP_SLACK = 4;

let header = null;
let nav = null;
let lastY = 0;
let hidden = false;
let sizeObserver = null;
// Timestamp until which scroll deltas are ignored.
let suppressUntil = 0;
// False while the page settles after opening on a fragment; the first real scroll re-arms it.
let armed = true;

// Ignore deltas for a moment after a programmatic jump, so a permalink does not hide the bars.
function suppressBriefly() {
  suppressUntil = performance.now() + 250;
  setHidden(false);
  lastY = window.scrollY;
}

// Measured whenever either bar changes size.
function measure() {
  if (!header) return;
  // getBoundingClientRect, not offsetHeight: rounding to an integer left a 0.5px seam between two bars that
  // share the same colour. Trimmed to 3dp to avoid float noise.
  const exact = (el) => Math.round(el.getBoundingClientRect().height * 1000) / 1000;
  const headerH = exact(header);
  const navH = nav ? exact(nav) : 0;
  const root = document.documentElement.style;
  // --header-h parks the nav flush against the header; --chrome-h is the pair's height.
  root.setProperty('--header-h', `${headerH}px`);
  root.setProperty('--chrome-h', `${Math.round((headerH + navH) * 1000) / 1000}px`);
}

function setHidden(next) {
  if (!header || hidden === next) return;
  hidden = next;
  // A header dropdown would float over the content once its bar is gone, so close it.
  if (next) closeHeaderMenus();
  document.documentElement.classList.toggle('chrome-hidden', next);
  for (const bar of [header, nav]) bar?.setAttribute('aria-hidden', next ? 'true' : 'false');
}

function onScroll() {
  if (!header) return;
  const y = window.scrollY;
  // Not armed yet: the page just opened on a fragment and is still positioning itself.
  if (!armed) {
    lastY = y;
    return;
  }
  // Never hide the bars at the top: there is nothing above to scroll back to.
  if (y <= TOP_SLACK) {
    setHidden(false);
    lastY = y;
    return;
  }
  // A programmatic jump produces one big downward delta; re-seed the reference point instead of hiding the bars
  // the instant the page jumped.
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
  // A deep link can open the page already scrolled past the bars, so ignore deltas until the reader actually
  // scrolls.
  if (location.hash) armed = false;
  else suppressBriefly();

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', measure, { passive: true });

  // Shortcuts, the account block and font swaps all change the heights, so re-measure.
  if (typeof ResizeObserver === 'function') {
    sizeObserver = new ResizeObserver(measure);
    sizeObserver.observe(header);
    if (nav) sizeObserver.observe(nav);
  }

  // A jump can land mid-page; keep the bars visible so the reader starts with navigation.
    window.addEventListener('hashchange', suppressBriefly);

    // A real gesture re-arms direction tracking. Wheel and touchmove scroll; `scroll` covers keyboard paging.
    const arm = () => {
      armed = true;
      lastY = window.scrollY;
      window.removeEventListener('wheel', arm);
      window.removeEventListener('touchmove', arm);
    };
    window.addEventListener('wheel', arm, { passive: true, once: true });
    window.addEventListener('touchmove', arm, { passive: true, once: true });
}

  // The app's own scrolls (permalink focus, inline-edit reveal, pager arm) must not read as the reader
  // scrolling down. Views call this right before their scrollIntoView().
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