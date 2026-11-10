// Applies the "Giao diện" preferences to the document. Three axes: theme (auto keeps following the OS), font
// (only a downloadable family pulls in fonts.css) and size (--post-scale / --ui-scale), all as <html> attrs.

import { getTheme, getFont, getFontScale, getFullNumbers, FONT_STACKS, FONT_DEFAULT as DEFAULT_FONT_KEY } from '../lib/settings.js';
import { setFullNumbersMode } from '../core/utils.js';

const FONT_HREF = '/assets/css/fonts.css';

const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

// Last applied full-numbers mode. `null` until the first applyAppearance(), so the boot call never fires a
// re-render.
let lastFullNumbers = null;

function resolvedTheme(mode) {
  if (mode === 'dark' || mode === 'light') return mode;
  return media && media.matches ? 'dark' : 'light';
}

function applyTheme(mode) {
  const root = document.documentElement;
  const resolved = resolvedTheme(mode);
  root.dataset.themeMode = mode;
  root.dataset.theme = resolved;
  // Tells the browser which UI to paint for native widgets, so they match the theme.
  root.style.colorScheme = resolved;
}

// The font stylesheet is a single <link> added on first use and never removed, so switching back and forth does
// not re-download. `be-vietnam` is already declared by font-default.css.
function ensureFontStylesheet() {
  if (document.getElementById('font-faces')) return;
  const link = document.createElement('link');
  link.id = 'font-faces';
  link.rel = 'stylesheet';
  link.href = FONT_HREF;
  document.head.append(link);
}

function applyFont(font) {
  const root = document.documentElement;
  root.dataset.font = font;
  if (font === DEFAULT_FONT_KEY) {
    // base.css names the default family and font-default.css declares the face, so clearing the inline value
    // lets those apply.
    root.style.removeProperty('--font');
    return;
  }
  const stack = FONT_STACKS[font];
  if (!stack) return;
  // Only a vendored family needs fonts.css; `system` must not fetch it.
  if (font !== 'system') ensureFontStylesheet();
  root.style.setProperty('--font', stack);
}

// Font size follows the same shape: unitless multipliers in --post-scale / --ui-scale, both 1 by default.
// index.html sets the same two properties before the first paint.
function applyFontScale({ postSize, uiSize }) {
  const root = document.documentElement;
  root.dataset.postSize = String(postSize);
  root.dataset.uiSize = String(uiSize);
  root.style.setProperty('--post-scale', String(postSize / 100));
  root.style.setProperty('--ui-scale', String(uiSize / 100));
}

export function applyAppearance() {
  applyTheme(getTheme());
  applyFont(getFont());
  applyFontScale(getFontScale());
  // core/utils.js reads the mode at render time, so it only has to be pushed in before the next render. A real
  // change asks the current view to re-render (app.js listens).
  const mode = getFullNumbers();
  const changed = lastFullNumbers !== null && mode !== lastFullNumbers;
  lastFullNumbers = mode;
  setFullNumbersMode(mode);
  if (changed) window.dispatchEvent(new CustomEvent('voz:format-change'));
}

// Called once at boot. The media listener is permanent; it reads the current setting.
export function wireTheme() {
  applyAppearance();
  if (!media) return;
  const onChange = () => {
    const mode = getTheme();
    if (mode === 'auto') applyTheme(mode);
  };
  if (media.addEventListener) media.addEventListener('change', onChange);
  else if (media.addListener) media.addListener(onChange);
  // Settings changed in another tab arrive through the same event saveSettings fires.
  window.addEventListener('voz:settings', applyAppearance);
}
