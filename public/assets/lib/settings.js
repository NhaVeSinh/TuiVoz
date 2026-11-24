/** Settings storage. */

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
  bannedUsers: BANNED_USERS_DEFAULT,
  fullNumbers: FULL_NUMBERS_DEFAULT,
  dataSaving: DATA_SAVING_DEFAULT,
  vozSupport: VOZ_SUPPORT_DEFAULT,
  pushEnabled: false,
  reactorNames: REACTOR_NAMES_DEFAULT,
});

// Colour scheme for the content area; chrome stays dark in both modes.
// auto follows the OS; catppuccin-mocha is a fixed palette driven by data-theme-mode.
export const THEME_MODES = ['auto', 'light', 'dark', 'catppuccin-mocha'];
export const THEME_DEFAULT = 'auto';
export const THEME_LABELS = {
  auto: 'Tự động theo hệ thống',
  light: 'Sáng',
  dark: 'Tối',
  'catppuccin-mocha': 'Catppuccin Mocha',
};

// List order matches the settings radio group. Only be-vietnam's 400
// face is linked eagerly; other families stay lazy.
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
// Family stack per option; `null` injects nothing.
export const FONT_STACKS = {
  // No stack: clearing --font falls back to base.css's "Be Vietnam".
  'be-vietnam': null,
  // Names OS fonts explicitly, or --font would fall back to the vendored default.
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  roboto: 'Roboto, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  // Cantarell has no Medium/Semibold; Bold serves 600/700.
  cantarell: '"Cantarell", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  'be-vietnam-pro': '"Be Vietnam Pro", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  // San Francisco first, then Apple-first fallbacks.
  'sf-pro-display': '"SF Pro Display", -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  // Vendored as "Segoe UI Local" so it can't shadow the OS face.
  'segoe-ui': '"Segoe UI Local", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

// Two axes: postSize scales post prose, uiSize everything else.
// Percentages applied as --post-scale / --ui-scale.
export const FONT_SCALE_MIN = 80;
export const FONT_SCALE_MAX = 200;
export const FONT_SCALE_STEP = 5;
export const FONT_SCALE_DEFAULT = 100;

export const IMAGE_DOWNLOAD_DEFAULT = false;
export const POST_SCREENSHOT_DEFAULT = true;
export const STATIC_AVATARS_DEFAULT = false;
// Strike through banned members ("KIA") like voz.vn.
// smart checks only members the reader opens; all checks every username near the viewport.
export const BANNED_USER_MODES = ['off', 'smart', 'all'];
export const BANNED_USERS_DEFAULT = 'off';
export const BANNED_USERS_LABELS = {
  off: 'Tắt',
  smart: 'Chế độ thông minh',
  all: 'Luôn hiển thị',
};
export const BANNED_USERS_HELP = {
  off: 'Tên nick hiện như bình thường, không kiểm tra gì.',
  smart: 'Chỉ hiển thị thành viên bị ban khi nhấn tooltip của thành viên hoặc khi xem tường nhà của họ.',
  all: 'Gạch ngang mọi nick bị ban ngay trong bài viết và danh sách chủ đề. Tốn nhiều lượt gọi API nhất.',
};

// Unrounded stats and absolute dates; off keeps voz.vn's rounding.
export const FULL_NUMBERS_MODES = ['off', 'thread', 'all'];
export const FULL_NUMBERS_DEFAULT = 'off';
export const FULL_NUMBERS_LABELS = {
  off: 'Tắt — rút gọn như voz.vn',
  thread: 'Áp dụng cho bên trong thread',
  all: 'Áp dụng cho toàn bộ web',
};

// Master switch for every data-saving lever (polling, reactions, embeds,
// prefetch, analytics). `auto` follows the device signal (saveData, slow
// effective type, cellular); iOS exposes none, so only the manual toggle works there.
export const DATA_SAVING_MODES = ['auto', 'on', 'off'];
export const DATA_SAVING_DEFAULT = 'auto';

// Fires voz.vn's adblock-check beacon (/xfmg.php) so usage counts toward
// the supporter score. Off by default.
export const VOZ_SUPPORT_DEFAULT = false;

// Names under posts cost one page scrape per post; show icons+count by
// default and let a tap open the full list instead.
export const REACTOR_NAMES_DEFAULT = false;
export const DATA_SAVING_LABELS = {
  auto: 'Tự động theo thiết bị',
  on: 'Luôn bật',
  off: 'Tắt',
};
export const DATA_SAVING_HELP = {
  auto: 'Bật khi trình duyệt báo đang dùng dữ liệu di động, Data Saver, hoặc mạng 2G (Chrome và trình duyệt Chromium trên Android). Firefox không đọc được tín hiệu này — dùng Bật/Tắt thủ công. WiFi và máy tính giữ nguyên như bình thường.',
  on: 'Áp dụng mọi biện pháp tiết kiệm ở mọi nơi, mọi thiết bị.',
  off: 'Không bao giờ tiết kiệm, kể cả khi thiết bị báo.',
};

export function normalizeFontScale(value) {
  // Number(null)/'' are 0 and would clamp to the floor; accept only numbers or numeric strings.
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

// Infinite scroll: on loads automatically; manual waits for the pager button.
export const SCROLL_MODES = ['on', 'manual', 'off'];
export const SCROLL_DEFAULT = 'manual';
export const SCROLL_LABELS = {
  on: 'Bật',
  manual: 'Kích hoạt theo người dùng yêu cầu',
  off: 'Tắt',
};

// Shown until the user edits; saved on first change so removals stick.
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
  // Default-on: only explicit `false` opts out.
  out.postScreenshot = raw?.postScreenshot === true || (raw?.postScreenshot !== false && POST_SCREENSHOT_DEFAULT);
  out.staticAvatars = raw?.staticAvatars === true;
  // Older builds stored a boolean; `true` meant "always".
  out.bannedUsers = raw?.bannedUsers === true
    ? 'all'
    : BANNED_USER_MODES.includes(raw?.bannedUsers)
      ? raw.bannedUsers
      : BANNED_USERS_DEFAULT;
  out.fullNumbers = FULL_NUMBERS_MODES.includes(raw?.fullNumbers) ? raw.fullNumbers : FULL_NUMBERS_DEFAULT;
  out.dataSaving = DATA_SAVING_MODES.includes(raw?.dataSaving) ? raw.dataSaving : DATA_SAVING_DEFAULT;
  out.vozSupport = raw?.vozSupport === true;
  out.pushEnabled = raw?.pushEnabled === true;
  out.reactorNames = raw?.reactorNames === true;
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
    /* Storage may be full or disabled. */
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

export function setVozSupport(enabled) {
  const settings = loadSettings();
  settings.vozSupport = enabled === true;
  return saveSettings(settings);
}

export function getVozSupport() {
  return loadSettings().vozSupport === true;
}

export function setPushEnabled(enabled) {
  const settings = loadSettings();
  settings.pushEnabled = enabled === true;
  return saveSettings(settings);
}

export function getPushEnabled() {
  return loadSettings().pushEnabled === true;
}

export function setReactorNames(enabled) {
  const settings = loadSettings();
  settings.reactorNames = enabled === true;
  return saveSettings(settings);
}

export function getReactorNames() {
  return loadSettings().reactorNames === true;
}

export function setInfiniteScroll(mode) {
  const settings = loadSettings();
  settings.infiniteScroll = SCROLL_MODES.includes(mode) ? mode : SCROLL_DEFAULT;
  return saveSettings(settings);
}

export function setDataSaving(mode) {
  const settings = loadSettings();
  settings.dataSaving = DATA_SAVING_MODES.includes(mode) ? mode : DATA_SAVING_DEFAULT;
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

export function setBannedUsers(mode) {
  const settings = loadSettings();
  settings.bannedUsers = BANNED_USER_MODES.includes(mode) ? mode : BANNED_USERS_DEFAULT;
  return saveSettings(settings);
}

export function getBannedUsers() {
  const mode = loadSettings().bannedUsers;
  return BANNED_USER_MODES.includes(mode) ? mode : BANNED_USERS_DEFAULT;
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

export function exportSettingsJson({ albums = [], recent = [], filters = [] } = {}) {
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
    bannedUsers: settings.bannedUsers,
    fullNumbers: settings.fullNumbers,
    vozSupport: settings.vozSupport,
    reactorNames: settings.reactorNames,
  };
  // Sticker payload mirrors the userscript backup format for cross-import.
  if (albums.length || recent.length) {
    payload.version = '1.2';
    payload.albums = albums;
    payload.recent = recent;
  }
  if (filters.length) {
    payload.filters = filters;
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
  // Userscript backups have no navShortcuts; accept as album-only.
  const albumSource = Array.isArray(source.albums) ? source.albums : null;
  const filterSource = Array.isArray(source.filters) ? source.filters : null;
  if (!Array.isArray(source.navShortcuts) && !albumSource && !filterSource) {
    return { ok: false, error: 'JSON phải có mảng "navShortcuts", "albums" hoặc "filters".' };
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
    filters: filterSource,
    addOnly: source.addOnly === true,
  };
}
