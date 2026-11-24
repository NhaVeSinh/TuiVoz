/** Theme applier. */

import { getTheme, getFont, getFontScale, getFullNumbers, FONT_STACKS, FONT_DEFAULT as DEFAULT_FONT_KEY } from '../lib/settings.js';
import { setFullNumbersMode } from '../core/utils.js';

const FONT_HREF = '/assets/css/fonts.css';

const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

// Last applied full-numbers mode; null until first apply so boot never re-renders.
let lastFullNumbers = null;

const CATPPUCCIN_BASE = { 'catppuccin-mocha': 'dark' };

function resolvedTheme(mode) {
  if (mode === 'dark' || mode === 'light') return mode;
  if (CATPPUCCIN_BASE[mode]) return CATPPUCCIN_BASE[mode];
  return media && media.matches ? 'dark' : 'light';
}

function applyTheme(mode) {
  const root = document.documentElement;
  const resolved = resolvedTheme(mode);
  root.dataset.themeMode = mode;
  root.dataset.theme = resolved;
  // Themes native widgets to match.
  root.style.colorScheme = resolved;
}

// One <link>, added once and kept; `be-vietnam` already ships in font-default.css.
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
    // Clearing the inline value lets base.css/font-default.css apply.
    root.style.removeProperty('--font');
    return;
  }
  const stack = FONT_STACKS[font];
  if (!stack) return;
  // Only vendored families need fonts.css; `system` must not fetch it.
  if (font !== 'system') ensureFontStylesheet();
  root.style.setProperty('--font', stack);
}

// Same shape as font/theme: unitless scales, preset by index.html before first paint.
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
  // utils reads the mode at render time; a real change re-renders via app.js.
  const mode = getFullNumbers();
  const changed = lastFullNumbers !== null && mode !== lastFullNumbers;
  lastFullNumbers = mode;
  setFullNumbersMode(mode);
  if (changed) window.dispatchEvent(new CustomEvent('voz:format-change'));
}

// Called once at boot; the media listener is permanent.
export function wireTheme() {
  applyAppearance();
  if (!media) return;
  const onChange = () => {
    const mode = getTheme();
    if (mode === 'auto') applyTheme(mode);
  };
  if (media.addEventListener) media.addEventListener('change', onChange);
  else if (media.addListener) media.addListener(onChange);
  // Cross-tab settings changes arrive via this event.
  window.addEventListener('voz:settings', applyAppearance);
}
