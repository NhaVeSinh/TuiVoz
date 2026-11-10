// Browser-local preferences. Nothing is sent to voz.vn; it lives in localStorage and is included in JSON
// backup/restore.

const KEY = 'voz-settings:v1';
const MAX_SHORTCUTS = 200;
const MAX_NAME = 40;

export function makeId() {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// Absolute http(s) URLs or site-relative paths only; never javascript:/data:.
export function normalizeUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 500) return null;
  if (/^\/(?!\/)/.test(raw)) return raw.replace(/[\s"<>`]/g, '');
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function normalizeShortcut(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  const url = normalizeUrl(raw.url);
  if (!name || !url) return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 64) : makeId();
  return { id, name, url };
}

export const emptySettings = () => ({
  version: 1,
  navShortcuts: [],
  infiniteScroll: SCROLL_DEFAULT,
  theme: THEME_DEFAULT,
  font: FONT_DEFAULT,
  postSize: FONT_SCALE_DEFAULT,
  uiSize: FONT_SCALE_DEFAULT,
  imageDownload: IMAGE_DOWNLOAD_DEFAULT,
  postScreenshot: POST_SCREENSHOT_DEFAULT,
  staticAvatars: STATIC_AVATARS_DEFAULT,
  fullNumbers: FULL_NUMBERS_DEFAULT,
});

// Colour scheme for the content area; the chrome keeps its dark styling in both modes.
//   auto — follow the OS and keep following it; light / dark — fixed.
export const THEME_MODES = ['auto', 'light', 'dark'];
export const THEME_DEFAULT = 'auto';
export const THEME_LABELS = {
  auto: 'Tự động theo hệ thống',
  light: 'Sáng',
  dark: 'Tối',
};

// Typography. The list order is the radio group order in Cài đặt → Giao diện. `be-vietnam` is the default and
// index.html links its 400 face directly; the other families stay lazy.
export const FONTS = ['be-vietnam', 'be-vietnam-pro', 'system', 'segoe-ui', 'cantarell', 'roboto', 'sf-pro-display'];
export const FONT_DEFAULT = 'be-vietnam';
export const FONT_LABELS = {
  'be-vietnam': 'Be Vietnam',
  'be-vietnam-pro': 'Be Vietnam Pro',
  system: 'Hệ thống',
  'segoe-ui': 'Segoe UI',
  cantarell: 'Cantarell',
  roboto: 'Roboto',
  'sf-pro-display': 'SF Pro Display',
};
// Family name + stylesheet per downloadable option. `null` injects nothing.
export const FONT_STACKS = {
  // The default carries no stack: base.css names "Be Vietnam" first, so clearing the inline --font applies it.
  'be-vietnam': null,
  // `system` must name the OS fonts explicitly: clearing --font would fall back to the vendored default in
  // base.css.
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  roboto: 'Roboto, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  // Cantarell has no Medium/Semibold master, so 600/700 are served by the Bold face.
  cantarell: '"Cantarell", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  'be-vietnam-pro': '"Be Vietnam Pro", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  // San Francisco first, then Apple-first fallbacks for other platforms.
  'sf-pro-display': '"SF Pro Display", -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  // The vendored face is "Segoe UI Local" so it cannot shadow the OS "Segoe UI". Local first.
  'segoe-ui': '"Segoe UI Local", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

// Cỡ chữ. Two independent axes: `postSize` scales prose inside a post, `uiSize` everything else. Both are
// percentages applied as --post-scale / --ui-scale.
export const FONT_SCALE_MIN = 80;
export const FONT_SCALE_MAX = 200;
export const FONT_SCALE_STEP = 5;
export const FONT_SCALE_DEFAULT = 100;

export const IMAGE_DOWNLOAD_DEFAULT = false;
export const POST_SCREENSHOT_DEFAULT = false;
export const STATIC_AVATARS_DEFAULT = false;

// Full (unrounded) statistics and absolute dates. off — voz.vn's rounded numbers; thread — inside a thread
// only; all — everywhere.
export const FULL_NUMBERS_MODES = ['off', 'thread', 'all'];
export const FULL_NUMBERS_DEFAULT = 'off';
export const FULL_NUMBERS_LABELS = {
  off: 'Tắt — rút gọn như voz.vn',
  thread: 'Áp dụng cho bên trong thread',
  all: 'Áp dụng cho toàn bộ web',
};

export function normalizeFontScale(value) {
  // Number(null) and Number('') are 0, which would clamp to the floor, so only accept a number or a numeric
  // string.
  if (typeof value === 'string') {
    if (value.trim() === '') return FONT_SCALE_DEFAULT;
  } else if (typeof value !== 'number') {
    return FONT_SCALE_DEFAULT;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) return FONT_SCALE_DEFAULT;
  const rounded = Math.round(number / FONT_SCALE_STEP) * FONT_SCALE_STEP;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, rounded));
}

// Infinite scroll for thread lists and threads:
//   on — load automatically; manual — only after the pager button; off — pager only.
export const SCROLL_MODES = ['on', 'manual', 'off'];
export const SCROLL_DEFAULT = 'manual';
export const SCROLL_LABELS = {
  on: 'Bật',
  manual: 'Kích hoạt theo người dùng yêu cầu',
  off: 'Tắt',
};

// Shown until the user edits the list; saved on first change so removals stick.
export const DEFAULT_SHORTCUTS = [
  { name: 'F33', url: '/f/diem-bao.33/' },
  { name: 'F17', url: '/f/chuyen-tro-linh-tinh.17/' },
];

export function normalizeSettings(raw) {
  const out = emptySettings();
  out.infiniteScroll = SCROLL_MODES.includes(raw?.infiniteScroll) ? raw.infiniteScroll : SCROLL_DEFAULT;
  out.theme = THEME_MODES.includes(raw?.theme) ? raw.theme : THEME_DEFAULT;
  out.font = FONTS.includes(raw?.font) ? raw.font : FONT_DEFAULT;
  out.postSize = normalizeFontScale(raw?.postSize);
  out.uiSize = normalizeFontScale(raw?.uiSize);
  out.imageDownload = raw?.imageDownload === true;
  out.postScreenshot = raw?.postScreenshot === true;
  out.staticAvatars = raw?.staticAvatars === true;
  out.fullNumbers = FULL_NUMBERS_MODES.includes(raw?.fullNumbers) ? raw.fullNumbers : FULL_NUMBERS_DEFAULT;
  const list = Array.isArray(raw?.navShortcuts) ? raw.navShortcuts : [];
  const seen = new Set();
  for (const item of list.slice(0, MAX_SHORTCUTS)) {
    const shortcut = normalizeShortcut(item);
    if (!shortcut || seen.has(shortcut.id)) continue;
    seen.add(shortcut.id);
    out.navShortcuts.push(shortcut);
  }
  return out;
}

export function loadSettings() {
  try {
    const stored = localStorage.getItem(KEY);
    if (!stored) return normalizeSettings({ navShortcuts: DEFAULT_SHORTCUTS });
    return normalizeSettings(JSON.parse(stored));
  } catch {
    return emptySettings();
  }
}

export function saveSettings(next) {
  const settings = normalizeSettings(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* Storage may be full or disabled; keep the in-memory result. */
  }
  window.dispatchEvent(new CustomEvent('voz:settings', { detail: settings }));
  return settings;
}

export function addShortcut(name, url) {
  const shortcut = normalizeShortcut({ name, url });
  if (!shortcut) return { ok: false, error: 'Nhập tên và liên kết http(s) hoặc đường dẫn bắt đầu bằng /.' };
  const settings = loadSettings();
  if (settings.navShortcuts.length >= MAX_SHORTCUTS) return { ok: false, error: `Tối đa ${MAX_SHORTCUTS} phím tắt.` };
  settings.navShortcuts.push(shortcut);
  saveSettings(settings);
  return { ok: true, shortcut, settings };
}

export function updateShortcut(id, patch) {
  const settings = loadSettings();
  const index = settings.navShortcuts.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false, error: 'Không tìm thấy phím tắt.' };
  const merged = normalizeShortcut({ ...settings.navShortcuts[index], ...patch });
  if (!merged) return { ok: false, error: 'Nhập tên và liên kết http(s) hoặc đường dẫn bắt đầu bằng /.' };
  merged.id = settings.navShortcuts[index].id;
  settings.navShortcuts[index] = merged;
  saveSettings(settings);
  return { ok: true, settings };
}

export function removeShortcut(id) {
  const settings = loadSettings();
  settings.navShortcuts = settings.navShortcuts.filter((item) => item.id !== id);
  saveSettings(settings);
  return settings;
}

export function moveShortcut(id, toIndex) {
  const settings = loadSettings();
  const from = settings.navShortcuts.findIndex((item) => item.id === id);
  if (from < 0) return settings;
  const target = Math.max(0, Math.min(settings.navShortcuts.length - 1, toIndex));
  if (from === target) return settings;
  const [item] = settings.navShortcuts.splice(from, 1);
  settings.navShortcuts.splice(target, 0, item);
  return saveSettings(settings);
}

export function setInfiniteScroll(mode) {
  const settings = loadSettings();
  settings.infiniteScroll = SCROLL_MODES.includes(mode) ? mode : SCROLL_DEFAULT;
  return saveSettings(settings);
}

export function getInfiniteScroll() {
  const mode = loadSettings().infiniteScroll;
  return SCROLL_MODES.includes(mode) ? mode : SCROLL_DEFAULT;
}

export function setTheme(mode) {
  const settings = loadSettings();
  settings.theme = THEME_MODES.includes(mode) ? mode : THEME_DEFAULT;
  return saveSettings(settings);
}

export function getTheme() {
  const mode = loadSettings().theme;
  return THEME_MODES.includes(mode) ? mode : THEME_DEFAULT;
}

export function setFont(font) {
  const settings = loadSettings();
  settings.font = FONTS.includes(font) ? font : FONT_DEFAULT;
  return saveSettings(settings);
}

export function getFont() {
  const font = loadSettings().font;
  return FONTS.includes(font) ? font : FONT_DEFAULT;
}

export function setFontScale({ postSize, uiSize } = {}) {
  const settings = loadSettings();
  if (postSize !== undefined) settings.postSize = normalizeFontScale(postSize);
  if (uiSize !== undefined) settings.uiSize = normalizeFontScale(uiSize);
  return saveSettings(settings);
}

export function getFontScale() {
  const { postSize, uiSize } = loadSettings();
  return { postSize, uiSize };
}

export function setImageDownload(enabled) {
  const settings = loadSettings();
  settings.imageDownload = enabled === true;
  return saveSettings(settings);
}

export function getImageDownload() {
  return loadSettings().imageDownload === true;
}

export function setPostScreenshot(enabled) {
  const settings = loadSettings();
  settings.postScreenshot = enabled === true;
  return saveSettings(settings);
}

export function getPostScreenshot() {
  return loadSettings().postScreenshot === true;
}

export function setStaticAvatars(enabled) {
  const settings = loadSettings();
  settings.staticAvatars = enabled === true;
  return saveSettings(settings);
}

export function getStaticAvatars() {
  return loadSettings().staticAvatars === true;
}

export function setFullNumbers(mode) {
  const settings = loadSettings();
  settings.fullNumbers = FULL_NUMBERS_MODES.includes(mode) ? mode : FULL_NUMBERS_DEFAULT;
  return saveSettings(settings);
}

export function getFullNumbers() {
  const mode = loadSettings().fullNumbers;
  return FULL_NUMBERS_MODES.includes(mode) ? mode : FULL_NUMBERS_DEFAULT;
}

export function exportSettingsJson({ albums = [], recent = [] } = {}) {
  const settings = loadSettings();
  const payload = {
    app: 'voz-web',
    version: 1,
    exportedAt: new Date().toISOString(),
    navShortcuts: settings.navShortcuts,
    infiniteScroll: settings.infiniteScroll,
    theme: settings.theme,
    font: settings.font,
    postSize: settings.postSize,
    uiSize: settings.uiSize,
    imageDownload: settings.imageDownload,
    postScreenshot: settings.postScreenshot,
    staticAvatars: settings.staticAvatars,
    fullNumbers: settings.fullNumbers,
  };
  // Sticker payload mirrors the userscript backup so either file can be restored.
  if (albums.length || recent.length) {
    payload.version = '1.2';
    payload.albums = albums;
    payload.recent = recent;
  }
  return JSON.stringify(payload, null, 2);
}

export function importSettingsJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text ?? ''));
  } catch {
    return { ok: false, error: 'JSON không hợp lệ.' };
  }
  const source = parsed && typeof parsed === 'object' && parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : parsed;
  if (!source || typeof source !== 'object') {
    return { ok: false, error: 'JSON phải là một object.' };
  }
  // A userscript backup has no navShortcuts — accept it as album-only.
  const albumSource = Array.isArray(source.albums) ? source.albums : null;
  if (!Array.isArray(source.navShortcuts) && !albumSource) {
    return { ok: false, error: 'JSON phải có mảng "navShortcuts" hoặc "albums".' };
  }
  const settings = Array.isArray(source.navShortcuts) ? normalizeSettings(source) : null;
  if (settings && source.navShortcuts.length && !settings.navShortcuts.length) {
    return { ok: false, error: 'Không có phím tắt hợp lệ trong JSON (tên rỗng hoặc liên kết sai).' };
  }
  if (settings) saveSettings(settings);
  return {
    ok: true,
    count: settings ? settings.navShortcuts.length : 0,
    settings: settings || loadSettings(),
    albums: albumSource,
    recent: Array.isArray(source.recent) ? source.recent : null,
    addOnly: source.addOnly === true,
  };
}
