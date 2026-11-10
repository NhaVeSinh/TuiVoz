// Browser-local settings: nav bar shortcuts plus JSON backup/restore.

import { app } from '../core/dom.js';
import { esc } from '../core/utils.js';
import { setBreadcrumbs } from '../ui/chrome.js';
import { setTitle } from '../ui/title.js';
import { toast } from '../ui/feedback.js';
import { openModal } from '../ui/modal.js';
import {
  loadSettings, addShortcut, updateShortcut, removeShortcut, moveShortcut,
  exportSettingsJson, importSettingsJson, setInfiniteScroll,
  SCROLL_MODES, SCROLL_LABELS,
  setTheme, setFont, setFontScale, getFontScale, setImageDownload, setPostScreenshot, setStaticAvatars,
  setFullNumbers, FULL_NUMBERS_MODES, FULL_NUMBERS_LABELS,
  THEME_MODES, THEME_LABELS, FONTS, FONT_LABELS,
  FONT_SCALE_MIN, FONT_SCALE_MAX, FONT_SCALE_STEP,
} from '../lib/settings.js';
import {
  getAlbums, addAlbum, renameAlbum, removeAlbums, moveAlbum, setAlbumImages,
  getRecentStickers, addRecentSticker, clearRecentStickers, flushStickerStorage,
  imageFileToBase64, MAX_NAME, MAX_RECENT,
} from '../lib/stickers.js';
import { importImgurAlbum } from '../lib/imgurImport.js';
import { ICON_DELETE, ICON_EDIT } from '../core/icons.js';

const dragIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
const moveUpIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg>';
const moveDownIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 10 6 6 6-6"/></svg>';

const SCROLL_HELP = {
  on: 'Tự nối trang kế tiếp khi cuộn tới cuối danh sách hoặc cuối chủ đề.',
  manual: 'Hiện nút trong thanh số trang. Chỉ tự nối sau khi bạn bấm nút đó; tải lại trang phải bấm lại.',
  off: 'Chỉ dùng thanh số trang, không tự nối trang.',
};

const THEME_HELP = {
  auto: 'Theo thiết lập sáng/tối của hệ điều hành và đổi theo khi bạn đổi cài đặt hệ thống.',
  light: 'Luôn dùng bảng màu sáng.',
  dark: 'Luôn dùng bảng màu tối cho vùng nội dung. Thanh trên cùng và thanh điều hướng giữ nguyên.',
};

const FONT_HELP = {
  system: 'Dùng phông có sẵn của máy, không tải thêm gì.',
  roboto: 'Tải phông Roboto (400/500/700) kèm chữ Việt, chỉ tải khi bạn chọn.',
  cantarell: 'Tải phông Cantarell (400/600) kèm chữ Việt, chỉ tải khi bạn chọn.',
  'be-vietnam-pro': 'Tải phông Be Vietnam Pro (400/500/700) kèm chữ Việt, chỉ tải khi bạn chọn.',
  'be-vietnam': 'Tải phông Be Vietnam (400/500/700 + nghiêng) kèm chữ Việt, chỉ tải khi bạn chọn.',
  'sf-pro-display': 'Tải phông SF Pro Display (400/500/700 + nghiêng) kèm chữ Việt, chỉ tải khi bạn chọn.',
  'segoe-ui': 'Tải phông Segoe UI (400/600 + nghiêng) kèm chữ Việt, chỉ tải khi bạn chọn. Trên Windows vốn đã có sẵn phông này.',
};

const SIZE_HELP = {
  post: 'Cỡ chữ của phần nội dung bài viết, tính theo % so với mặc định. Không ảnh hưởng tới phần tên, ngày tháng hay nút bên dưới bài.',
  ui: 'Cỡ chữ của mọi chỗ khác: danh sách chủ đề, thanh trên cùng, nút, biểu mẫu và trang cài đặt.',
};

const FULL_NUMBERS_HELP = {
  off: 'Giữ nguyên kiểu voz.vn: 13K bài viết, 3 giờ trước, năm tham gia.',
  thread: 'Chỉ trong chủ đề: số bài viết, điểm, số trả lời/lượt xem và thời gian hiện đầy đủ. Danh sách ngoài chủ đề vẫn rút gọn.',
  all: 'Toàn bộ web: mọi số liệu và mốc thời gian đều hiện đầy đủ, kể cả danh sách chủ đề, hồ sơ và trang chủ.',
};

// Radio-card group shared by the appearance settings. `name` keys the input group and the
// data attribute the change handler reads back.
function optionCards(name, values, labels, help, active) {
  return `<ul class="option-cards" role="radiogroup" aria-label="${esc(name)}">
    ${values.map(
      (value) => `<li>
        <label class="option-card${active === value ? ' is-active' : ''}">
          <input type="radio" name="${esc(name)}" value="${esc(value)}"${active === value ? ' checked' : ''}>
          <span class="option-card-name">${esc(labels[value])}</span>
          ${help && help[value] ? `<span class="option-card-desc">${esc(help[value])}</span>` : ''}
        </label>
      </li>`
    ).join('')}
  </ul>`;
}

function sizeRow(id, label, help, value) {
  return `<div class="size-row">
    <div class="size-row-head">
      <label for="${id}">${esc(label)}</label>
      <output class="size-value" id="${id}-value" for="${id}">${value}%</output>
    </div>
    <input class="size-slider" type="range" id="${id}" min="${FONT_SCALE_MIN}" max="${FONT_SCALE_MAX}" step="${FONT_SCALE_STEP}" value="${value}">
    <span class="option-card-desc">${esc(help)}</span>
  </div>`;
}

function shortcutRows() {
  const { navShortcuts } = loadSettings();
  if (!navShortcuts.length) return '<li class="shortcut-empty">Chưa có phím tắt nào. Thêm ở khung bên dưới.</li>';
  return navShortcuts
    .map(
      (item, index) => `<li class="shortcut-row" draggable="true" data-shortcut-id="${esc(item.id)}" data-index="${index}">
        <span class="shortcut-handle" title="Kéo để đổi thứ tự" aria-hidden="true">${dragIcon}</span>
        <span class="shortcut-index">${index + 1}</span>
        <span class="settings-reorder-controls">
          <button type="button" class="settings-reorder-button" data-move-shortcut="up" aria-label="Đưa ${esc(item.name)} lên"${index === 0 ? ' disabled' : ''}>${moveUpIcon}</button>
          <button type="button" class="settings-reorder-button" data-move-shortcut="down" aria-label="Đưa ${esc(item.name)} xuống"${index === navShortcuts.length - 1 ? ' disabled' : ''}>${moveDownIcon}</button>
        </span>
        <span class="shortcut-main">
          <span class="shortcut-name">${esc(item.name)}</span>
          <span class="shortcut-url">${esc(item.url)}</span>
        </span>
        <button type="button" class="button button--small shortcut-edit" data-edit="${esc(item.id)}" title="Sửa" aria-label="Sửa ${esc(item.name)}">${ICON_EDIT}</button>
        <button type="button" class="button button--small button--danger shortcut-delete" data-delete="${esc(item.id)}" title="Xoá" aria-label="Xoá ${esc(item.name)}">${ICON_DELETE}</button>
      </li>`
    )
    .join('');
}

function stickerAlbumRows() {
  const albums = getAlbums();
  if (!albums.length) return '<li class="sticker-album-empty">Chưa có album nào. Thêm album imgur hoặc tạo album từ ảnh bên dưới.</li>';
  return albums
    .map(
      (album, index) => `<li class="sticker-album-row" draggable="true" data-album-id="${esc(album.id)}" data-index="${index}">
        <span class="shortcut-handle" title="Kéo để đổi thứ tự" aria-hidden="true">${dragIcon}</span>
        <span class="shortcut-index">${index + 1}</span>
        <span class="settings-reorder-controls">
          <button type="button" class="settings-reorder-button" data-move-album="up" aria-label="Đưa album ${esc(album.name)} lên"${index === 0 ? ' disabled' : ''}>${moveUpIcon}</button>
          <button type="button" class="settings-reorder-button" data-move-album="down" aria-label="Đưa album ${esc(album.name)} xuống"${index === albums.length - 1 ? ' disabled' : ''}>${moveDownIcon}</button>
        </span>
        <span class="sticker-album-preview"><img src="${esc(album.preview)}" alt="" loading="lazy"></span>
        <span class="shortcut-main">
          <span class="shortcut-name">${esc(album.name)}</span>
          <span class="shortcut-url">${esc(album.images.length)} hình · <span class="sticker-badge sticker-badge--${album.type}">${album.type}</span></span>
        </span>
        <label class="sticker-album-select"><input type="checkbox" class="album-select" data-id="${esc(album.id)}" aria-label="Chọn ${esc(album.name)}"></label>
        <button type="button" class="button button--small sticker-rename" data-rename="${esc(album.id)}" title="Đổi tên" aria-label="Đổi tên ${esc(album.name)}">${ICON_EDIT}</button>
        <button type="button" class="button button--small sticker-export" data-export="${esc(album.id)}" title="Xuất album" aria-label="Xuất album ${esc(album.name)}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 19h14"/></svg></button>
        <button type="button" class="button button--small sticker-images" data-images="${esc(album.id)}" title="Xem/sửa hình ảnh" aria-label="Xem hình ảnh ${esc(album.name)}">🖼️</button>
        <button type="button" class="button button--small button--danger sticker-delete" data-delete="${esc(album.id)}" title="Xoá album" aria-label="Xoá ${esc(album.name)}">${ICON_DELETE}</button>
      </li>`
    )
    .join('');
}

function recentPreviewHtml() {
  const recent = getRecentStickers();
  if (!recent.length) return '<p class="u-dimmed">Chưa có sticker gần đây.</p>';
  return recent
    .map((img) => `<span class="sticker-recent-item"><img src="${esc(img.base64 || img.url)}" alt="" loading="lazy" title="${esc(img.url)}"></span>`)
    .join('');
}

// The settings page is split into tabs so the reader sees one group at a time instead of one
// long scroll. Every panel stays in the DOM (hidden with [hidden]) because the wiring below
// resolves its elements once at mount — dropping a panel would leave those handlers bound to
// detached nodes.
const TABS = [
  { id: 'appearance', label: 'Giao diện' },
  { id: 'system', label: 'Hệ thống' },
  { id: 'shortcuts', label: 'Phím tắt' },
  { id: 'stickers', label: 'Sticker' },
  { id: 'backup', label: 'Sao lưu / phục hồi' },
];

const TAB_IDS = new Set(TABS.map((tab) => tab.id));

// Old fragments that no longer name a tab: `#scroll` was its own tab before its settings moved
// into Hệ thống, so a saved link still lands on the panel that now holds them.
const TAB_ALIASES = { scroll: 'system' };

// The active tab lives in the fragment so the choice survives a reload, and so the sticker
// picker's "Quản lý sticker" link (/cai-dat-tuivoz#stickers) opens the right panel.
export function settingsTabFromHash(hash = location.hash) {
  const id = String(hash || '').replace(/^#/, '');
  if (TAB_IDS.has(id)) return id;
  return TAB_ALIASES[id] || TABS[0].id;
}

function tabsHtml(active) {
  return `<div class="tabs settings-tabs" role="tablist" aria-label="Mục cài đặt">
    ${TABS.map(
      (tab) => `<button type="button" role="tab" id="tab-${tab.id}" data-tab="${tab.id}"
        aria-selected="${tab.id === active}" aria-controls="panel-${tab.id}"
            tabindex="${tab.id === active ? '0' : '-1'}"
            class="${tab.id === active ? 'is-active' : ''}">${esc(tab.label)}</button>`
        ).join('')}
  </div>`;
}

function settingsHtml(active = settingsTabFromHash()) {
  const { navShortcuts, infiniteScroll, theme, font, postSize, uiSize, imageDownload, postScreenshot, staticAvatars, fullNumbers } = loadSettings();
  const albums = getAlbums();
  return `<div class="block settings-block">
      <h1 class="block-header">Cài đặt</h1>
      <p class="settings-note">Các thiết lập dưới đây chỉ lưu trên trình duyệt này (localStorage), không gửi lên voz.vn.</p>
    </div>
    <div class="block settings-tabbed">
      ${tabsHtml(active)}
      <section class="settings-panel" id="panel-appearance" role="tabpanel" aria-labelledby="tab-appearance"${active === 'appearance' ? '' : ' hidden'}>
        <div class="block-body--pad">
          <h3 class="settings-subhead">Chọn giao diện</h3>
          <p class="formHint">Sáng/tối chỉ áp dụng cho vùng nội dung. Thanh trên cùng và thanh điều hướng giữ nguyên kiểu voz.vn.</p>
          ${optionCards('theme-mode', THEME_MODES, THEME_LABELS, THEME_HELP, theme)}
          <h3 class="settings-subhead">Phông chữ</h3>
          <p class="formHint">Phông nằm trong máy chủ của trang này và chỉ được tải khi bạn chọn, nên mặc định không tốn thêm dữ liệu.</p>
          ${optionCards('font-family', FONTS, FONT_LABELS, FONT_HELP, font)}
          <h3 class="settings-subhead">Cỡ chữ</h3>
          <p class="formHint">Tính theo % so với cỡ mặc định (100%). Hai mục dưới đây độc lập nhau nên có thể chỉnh riêng phần nội dung bài viết.</p>
          ${sizeRow('size-post', 'Cỡ chữ nội dung bài viết', SIZE_HELP.post, postSize)}
          ${sizeRow('size-ui', 'Cỡ chữ những chỗ khác', SIZE_HELP.ui, uiSize)}
        </div>
      </section>
      <section class="settings-panel" id="panel-system" role="tabpanel" aria-labelledby="tab-system"${active === 'system' ? '' : ' hidden'}>
        <div class="block-body--pad">
          <h3 class="settings-subhead">Hiện thị số liệu không rút gọn</h3>
          <p class="formHint">voz.vn rút gọn số liệu (13K, 1M) và thời gian tương đối (3 giờ trước). Bật mục này để thấy số đầy đủ và mốc thời gian chính xác.</p>
          ${optionCards('full-numbers', FULL_NUMBERS_MODES, FULL_NUMBERS_LABELS, FULL_NUMBERS_HELP, fullNumbers)}
          <h3 class="settings-subhead">Ảnh trong bài viết</h3>
          <label class="settings-toggle" for="image-download">
            <span class="settings-toggle-copy">
              <span class="settings-toggle-name">Tải ảnh</span>
              <span class="option-card-desc">Hiện nút tải ở góc phải ảnh lớn. Ảnh WebP được đổi sang JPG trước khi lưu.</span>
            </span>
            <input type="checkbox" id="image-download"${imageDownload ? ' checked' : ''}>
          </label>
          <h3 class="settings-subhead">Bài viết</h3>
          <label class="settings-toggle" for="post-screenshot">
            <span class="settings-toggle-copy">
              <span class="settings-toggle-name">Hiển thị nút chụp bài viết</span>
              <span class="option-card-desc">Hiện nút ở góc phải mỗi bài viết; bấm để lưu cả bài (kèm tiêu đề chủ đề, ảnh, liên kết, nhúng) thành một ảnh PNG.</span>
            </span>
            <input type="checkbox" id="post-screenshot"${postScreenshot ? ' checked' : ''}>
          </label>
          <label class="settings-toggle" for="static-avatars">
            <span class="settings-toggle-copy">
              <span class="settings-toggle-name">Tắt ảnh động ảnh đại diện</span>
              <span class="option-card-desc">Ảnh đại diện động (GIF/WebP) chỉ hiện khung hình đầu, không chạy. Ảnh tĩnh giữ nguyên.</span>
            </span>
            <input type="checkbox" id="static-avatars"${staticAvatars ? ' checked' : ''}>
          </label>
          <h3 class="settings-subhead">Cuộn trang liên tục</h3>
          <p class="formHint">Áp dụng cho danh sách chủ đề và trong chủ đề: khi cuộn tới cuối trang, trang kế tiếp được nối thêm vào bên dưới thay vì phải bấm số trang.</p>
          ${optionCards('infinite-scroll', SCROLL_MODES, SCROLL_LABELS, SCROLL_HELP, infiniteScroll)}
        </div>
      </section>
      <section class="settings-panel" id="panel-shortcuts" role="tabpanel" aria-labelledby="tab-shortcuts"${active === 'shortcuts' ? '' : ' hidden'}>
        <div class="block-body--pad">
          <p class="settings-count" id="shortcut-count">${navShortcuts.length} phím tắt</p>
          <p class="formHint">Phím tắt hiện cạnh <strong>Bài mới</strong> trên thanh trên cùng, theo thứ tự từ trên xuống dưới, trái sang phải. Kéo thả hoặc dùng nút ↑/↓ trên mobile để đổi thứ tự.</p>
          <ul class="shortcut-list" id="shortcut-list">${shortcutRows()}</ul>
          <form id="shortcut-form" class="shortcut-form" autocomplete="off">
            <div class="formRow">
              <label for="shortcut-name">Tên phím tắt</label>
              <input class="input" id="shortcut-name" name="name" maxlength="40" placeholder="Ví dụ: Overclock" required>
            </div>
            <div class="formRow">
              <label for="shortcut-url">Liên kết</label>
              <input class="input" id="shortcut-url" name="url" maxlength="500" placeholder="Ví dụ: http://localhost:3111/f/overclocking-cooling-modding.6/" required>
            </div>
            <p class="formError" id="shortcut-error" hidden></p>
            <div class="shortcut-form-actions">
              <button class="button button--primary" type="submit" id="shortcut-submit">Thêm phím tắt</button>
              <button class="button" type="button" id="shortcut-cancel" hidden>Huỷ sửa</button>
            </div>
          </form>
        </div>
      </section>
      <section class="settings-panel" id="panel-stickers" role="tabpanel" aria-labelledby="tab-stickers"${active === 'stickers' ? '' : ' hidden'}>
        <div class="block-body--pad">
        <p class="settings-count" id="sticker-count">${albums.length} album</p>
        <p class="formHint">Album sticker dùng trong nút <strong>Sticker</strong> ở thanh công cụ soạn thảo. Thêm album từ imgur (tải ảnh về máy dưới dạng base64) hoặc tạo album từ ảnh tự chọn.</p>
        <ul class="sticker-album-list" id="sticker-album-list">${stickerAlbumRows()}</ul>
        <div class="sticker-actions">
          <button class="button button--primary" type="button" id="sticker-add-imgur">+ Thêm album imgur</button>
          <button class="button" type="button" id="sticker-add-local">+ Tạo album từ ảnh</button>
          <button class="button" type="button" id="sticker-import-json">📥 Nhập album từ JSON</button>
          <button class="button button--danger" type="button" id="sticker-delete-selected">Xoá album đã chọn</button>
        </div>
        <form id="sticker-imgur-form" class="sticker-form" hidden autocomplete="off">
          <div class="formRow">
            <label for="sticker-imgur-name">Tên album</label>
            <input class="input" id="sticker-imgur-name" maxlength="${MAX_NAME}" placeholder="Ví dụ: Pepe" required>
          </div>
          <div class="formRow">
            <label for="sticker-imgur-link">URL album imgur</label>
            <input class="input" id="sticker-imgur-link" maxlength="500" placeholder="https://imgur.com/a/liverpool-emoticons-saitlzr" required>
          </div>
          <p class="formHint">Hỗ trợ cả <code>https://imgur.com/a/saitlzr</code> và <code>https://imgur.com/a/liverpool-emoticons-saitlzr</code>.</p>
          <p class="formError" id="sticker-imgur-error" hidden></p>
          <p class="sticker-progress" id="sticker-imgur-progress" hidden></p>
          <div class="shortcut-form-actions">
            <button class="button button--primary" type="submit" id="sticker-imgur-submit">Lưu &amp; tải hình ảnh</button>
            <button class="button" type="button" id="sticker-imgur-cancel">Huỷ</button>
          </div>
        </form>
        <form id="sticker-local-form" class="sticker-form" hidden autocomplete="off">
          <div class="formRow">
            <label for="sticker-local-name">Tên album</label>
            <input class="input" id="sticker-local-name" maxlength="${MAX_NAME}" placeholder="Ví dụ: Pepe Collection" required>
          </div>
          <div class="formRow">
            <label for="sticker-local-files">Hình ảnh</label>
            <input class="input" id="sticker-local-files" type="file" accept="image/*" multiple required>
          </div>
          <p class="formHint">Ảnh được thu nhỏ tối đa 400px và lưu base64 trên trình duyệt này.</p>
          <p class="formError" id="sticker-local-error" hidden></p>
          <p class="sticker-progress" id="sticker-local-progress" hidden></p>
          <div class="shortcut-form-actions">
            <button class="button button--primary" type="submit" id="sticker-local-submit">Tạo album</button>
            <button class="button" type="button" id="sticker-local-cancel">Huỷ</button>
          </div>
        </form>
        <form id="sticker-import-form" class="sticker-form" hidden autocomplete="off">
          <p class="formHint">Nhập tệp <code>.json</code> xuất từ đây hoặc từ userscript (file một album có
            <code>addOnly</code> chỉ <strong>thêm</strong> album mới, bỏ qua album trùng tên).
            File sao lưu đầy đủ sẽ thay thế toàn bộ album và sticker gần đây.</p>
          <div class="formRow">
            <label for="sticker-import-files">Tệp JSON</label>
            <input class="input" id="sticker-import-files" type="file" accept=".json,application/json" multiple>
          </div>
          <p class="formHint">Hoặc dán JSON trực tiếp:</p>
          <textarea class="textarea code-box" id="sticker-import-text" spellcheck="false" rows="6" aria-label="JSON album"></textarea>
          <p class="formError" id="sticker-import-error" hidden></p>
          <p class="sticker-progress" id="sticker-import-progress" hidden></p>
          <div class="shortcut-form-actions">
            <button class="button button--primary" type="button" id="sticker-import-submit">Nhập album</button>
            <button class="button" type="button" id="sticker-import-cancel">Huỷ</button>
          </div>
        </form>
        <div class="formRow">
          <label>Sticker gần đây<span class="u-dimmed" id="sticker-recent-count"></span></label>
          <div class="sticker-recent-preview" id="sticker-recent-preview">${recentPreviewHtml()}</div>
          <div class="shortcut-form-actions">
            <button class="button button--danger" type="button" id="sticker-recent-clear">Xoá hết gần đây</button>
          </div>
        </div>
                  </div>
                </section>
                <section class="settings-panel" id="panel-backup" role="tabpanel" aria-labelledby="tab-backup"${active === 'backup' ? '' : ' hidden'}>
        <div class="block-body--pad settings-backup">
          <p class="formHint">JSON chứa thiết lập của trang này <strong>và</strong> toàn bộ album sticker (kèm ảnh base64). Dán JSON vào ô dưới rồi bấm Phục hồi để ghi đè.</p>
          <label class="u-srOnly" for="settings-json">JSON thiết lập</label>
          <textarea class="textarea code-box" id="settings-json" spellcheck="false" rows="10"></textarea>
          <p class="formError" id="settings-json-error" hidden></p>
          <div class="shortcut-form-actions">
            <button class="button" type="button" id="settings-export">Xuất JSON</button>
            <button class="button" type="button" id="settings-download">Tải tệp .json</button>
            <button class="button button--primary" type="button" id="settings-import">Phục hồi từ JSON</button>
            <button class="button button--danger" type="button" id="settings-reset">Xoá toàn bộ thiết lập</button>
          </div>
        </div>
      </section>
    </div>`;
}

// Writes an imported JSON payload into storage and reports what changed.
// Shared by the sticker import panel and the backup/restore section.
async function applyImported(result) {
  const parts = [];
  if (result.albums) {
    if (result.addOnly) {
      // Single-album file: only add names that are not already present.
      const names = new Set(getAlbums().map((album) => album.name));
      let added = 0;
      let skipped = 0;
      for (const raw of result.albums) {
        const name = String(raw?.name ?? '').replace(/\s+/g, ' ').trim();
        if (!name || names.has(name)) { skipped += 1; continue; }
        const res = addAlbum(raw);
        if (res.ok) { names.add(name); added += 1; } else skipped += 1;
      }
      parts.push(`thêm ${added} album (bỏ qua ${skipped} trùng tên)`);
    } else {
      const saved = result.albums.map((raw) => addAlbum(raw)).filter((res) => res.ok).length;
      parts.push(`${saved} album`);
    }
    // Only a full backup carries recents; add-only files must not clear them.
    if (!result.addOnly && Array.isArray(result.recent)) {
      clearRecentStickers();
      for (const item of [...result.recent].reverse()) {
        const url = typeof item === 'string' ? item : item?.url;
        if (url) addRecentSticker(url, typeof item === 'object' ? item?.base64 : null);
      }
      parts.push(`${getRecentStickers().length} gần đây`);
    }
  }
  await flushStickerStorage();
  renderStickerExtras();
  return parts;
}

// Refreshes whatever sticker UI is currently mounted (settings page only).
function renderStickerExtras() {
  if (typeof window.__stickerRerenderExtras === 'function' && document.getElementById('sticker-album-list')) {
    window.__stickerRerenderExtras();
  }
}

// Sticker album management: add (imgur import / local files / JSON), rename, reorder,
// bulk delete, per-album export, image viewer and recents.
function wireStickerSettings() {
  const albumList = document.getElementById('sticker-album-list');
  if (!albumList) return () => {};
  const countEl = document.getElementById('sticker-count');
  const recentBox = document.getElementById('sticker-recent-preview');
  const recentCount = document.getElementById('sticker-recent-count');
  let draggedId = null;

  const rerenderExtras = () => {
    albumList.innerHTML = stickerAlbumRows();
    if (countEl) countEl.textContent = `${getAlbums().length} album`;
    if (recentBox) recentBox.innerHTML = recentPreviewHtml();
    if (recentCount) recentCount.textContent = ` · ${getRecentStickers().length}/${MAX_RECENT}`;
  };
  window.__stickerRerenderExtras = rerenderExtras;
  rerenderExtras();

  const imgurForm = document.getElementById('sticker-imgur-form');
  const localForm = document.getElementById('sticker-local-form');
  const importForm = document.getElementById('sticker-import-form');
  const toggle = (form, show) => {
    form.hidden = !show;
    if (show) form.querySelector('input').focus();
  };
  document.getElementById('sticker-add-imgur').addEventListener('click', () => {
    toggle(localForm, false);
    toggle(importForm, false);
    toggle(imgurForm, imgurForm.hidden);
  });
  document.getElementById('sticker-add-local').addEventListener('click', () => {
    toggle(imgurForm, false);
    toggle(importForm, false);
    toggle(localForm, localForm.hidden);
  });
  document.getElementById('sticker-import-json').addEventListener('click', () => {
    toggle(imgurForm, false);
    toggle(localForm, false);
    toggle(importForm, importForm.hidden);
  });
  document.getElementById('sticker-imgur-cancel').addEventListener('click', () => { imgurForm.reset(); toggle(imgurForm, false); });
  document.getElementById('sticker-local-cancel').addEventListener('click', () => { localForm.reset(); toggle(localForm, false); });
  document.getElementById('sticker-import-cancel').addEventListener('click', () => { importForm.reset(); toggle(importForm, false); });

  const setStatus = (el, message, isError = false) => {
    el.textContent = message;
    el.hidden = !message;
    el.classList.toggle('is-error', isError);
  };

  const imgurError = document.getElementById('sticker-imgur-error');
  const imgurProgress = document.getElementById('sticker-imgur-progress');
  imgurForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('sticker-imgur-name').value.trim();
    const link = document.getElementById('sticker-imgur-link').value.trim();
    const submit = document.getElementById('sticker-imgur-submit');
    setStatus(imgurError, '');
    submit.disabled = true;
    submit.textContent = 'Đang tải…';
    try {
      const result = await importImgurAlbum({ name, link, onProgress: (message) => setStatus(imgurProgress, message) });
      if (!result.ok) {
        setStatus(imgurError, `❌ ${result.error}`, true);
        setStatus(imgurProgress, '');
        return;
      }
      const saved = addAlbum(result.album);
      if (!saved.ok) {
        setStatus(imgurError, `❌ ${saved.error}`, true);
        return;
      }
      await flushStickerStorage();
      setStatus(imgurProgress, `✅ Đã lưu ${result.album.images.length} hình ảnh${result.errors ? ` (${result.errors} lỗi)` : ''}.`);
      imgurForm.reset();
      rerenderExtras();
      toast(`Đã thêm album "${saved.album.name}"`);
      setTimeout(() => { setStatus(imgurProgress, ''); toggle(imgurForm, false); }, 1200);
    } catch (err) {
      setStatus(imgurError, `❌ ${err.message || err}`, true);
      setStatus(imgurProgress, '');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Lưu & tải hình ảnh';
    }
  });

  const localError = document.getElementById('sticker-local-error');
  const localProgress = document.getElementById('sticker-local-progress');
  localForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('sticker-local-name').value.trim();
    const files = [...document.getElementById('sticker-local-files').files].filter((file) => file.type.startsWith('image/'));
    if (!files.length) return setStatus(localError, '❌ Chọn ít nhất một tệp hình ảnh.', true);
    const submit = document.getElementById('sticker-local-submit');
    setStatus(localError, '');
    submit.disabled = true;
    submit.textContent = 'Đang xử lý…';
    const images = [];
    let failed = 0;
    for (let i = 0; i < files.length; i += 1) {
      setStatus(localProgress, `⬇️ ${i + 1}/${files.length}: ${files[i].name}`);
      try {
        const base64 = await imageFileToBase64(files[i]);
        images.push({ url: base64, base64 });
      } catch {
        failed += 1;
      }
    }
    const saved = addAlbum({ name, type: 'pikvn', preview: images[0]?.base64, images });
    if (!saved.ok) {
      setStatus(localError, `❌ ${saved.error}`, true);
      setStatus(localProgress, '');
    } else {
      try {
        await flushStickerStorage();
      } catch (error) {
        setStatus(localError, `❌ ${error.message}`, true);
        setStatus(localProgress, '');
        submit.disabled = false;
        submit.textContent = 'Tạo album';
        return;
      }
      setStatus(localProgress, `✅ Đã lưu ${images.length} hình ảnh${failed ? ` (${failed} lỗi)` : ''}.`);
      localForm.reset();
      rerenderExtras();
      toast(`Đã thêm album "${saved.album.name}"`);
      setTimeout(() => { setStatus(localProgress, ''); toggle(localForm, false); }, 1200);
    }
    submit.disabled = false;
    submit.textContent = 'Tạo album';
  });

  // JSON album import: accepts files exported here and files exported by the userscript.
  const importError = document.getElementById('sticker-import-error');
  const importProgress = document.getElementById('sticker-import-progress');
  const importFiles = document.getElementById('sticker-import-files');
  const importText = document.getElementById('sticker-import-text');

  const importOne = async (text, label) => {
    const result = importSettingsJson(text);
    if (!result.ok) return { ok: false, error: `${label}: ${result.error}` };
    if (!result.albums) return { ok: false, error: `${label}: tệp không có mảng "albums".` };
    const applied = await applyImported(result);
    return { ok: true, applied };
  };

  const runImport = async () => {
    const files = [...importFiles.files];
    setStatus(importError, '');
    const applied = [];
    let failed = 0;
    if (files.length) {
      for (let i = 0; i < files.length; i += 1) {
        setStatus(importProgress, `📥 ${i + 1}/${files.length}: ${files[i].name}`);
        try {
          const outcome = await importOne(await files[i].text(), files[i].name);
          if (outcome.ok) applied.push(...outcome.applied);
          else { failed += 1; setStatus(importError, `❌ ${outcome.error}`, true); }
        } catch (err) {
          failed += 1;
          setStatus(importError, `❌ ${files[i].name}: ${err.message || err}`, true);
        }
      }
    } else if (importText.value.trim()) {
      const outcome = await importOne(importText.value, 'JSON dán');
      if (outcome.ok) applied.push(...outcome.applied);
      else { failed += 1; setStatus(importError, `❌ ${outcome.error}`, true); }
    } else {
      return setStatus(importError, '❌ Chọn tệp .json hoặc dán JSON vào ô bên dưới.', true);
    }
    rerenderExtras();
    if (applied.length) {
      setStatus(importProgress, `✅ Đã nhập: ${applied.join(' · ')}${failed ? ` (${failed} tệp lỗi)` : ''}.`);
      toast('Đã nhập album từ JSON');
      importForm.reset();
      setTimeout(() => { setStatus(importProgress, ''); toggle(importForm, false); }, 1500);
    } else {
      setStatus(importProgress, '');
    }
  };
  document.getElementById('sticker-import-submit').addEventListener('click', runImport);
  importFiles.addEventListener('change', () => setStatus(importError, ''));
  albumList.addEventListener('click', async (event) => {
    const renameBtn = event.target.closest('[data-rename]');
    if (renameBtn) {
      openAlbumEditor(renameBtn.dataset.rename, rerenderExtras);
      return;
    }
    const exportBtn = event.target.closest('[data-export]');
    if (exportBtn) {
      const album = getAlbums().find((item) => item.id === exportBtn.dataset.export);
      if (!album) return;
      // Single-album files are add-only for stickers (never a full wipe).
      const payload = JSON.stringify(
        { version: '1.3', exportDate: new Date().toISOString(), addOnly: true, albums: [album] },
        null,
        2
      );
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safe = album.name.replace(/[^a-zA-Z0-9\u00C0-\u1EF9]/g, '_').slice(0, 30);
      link.href = url;
      link.download = `voz-sticker-album-${safe}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Đã xuất album');
      return;
    }
    const imagesBtn = event.target.closest('[data-images]');
    if (imagesBtn) {
          openAlbumEditor(imagesBtn.dataset.images, rerenderExtras);
      return;
    }
    const deleteBtn = event.target.closest('[data-delete]');
    if (deleteBtn) {
      const album = getAlbums().find((item) => item.id === deleteBtn.dataset.delete);
      if (!album) return;
      const extra = album.type === 'pikvn'
        ? '\n\nẢnh đã tải lên máy chủ sẽ không bị xoá, chỉ dữ liệu album trong trình duyệt bị xoá.'
        : '';
      if (!window.confirm(`Xoá album "${album.name}"?${extra}`)) return;
      removeAlbums([album.id]);
      try {
        await flushStickerStorage();
        rerenderExtras();
        toast('Đã xoá album');
      } catch (error) {
        toast(`Không lưu được thay đổi: ${error.message}`, true);
      }
    }
  });

  document.getElementById('sticker-delete-selected').addEventListener('click', async () => {
    const ids = [...albumList.querySelectorAll('.album-select:checked')].map((box) => box.dataset.id);
    if (!ids.length) return toast('Chọn album cần xoá trước.', true);
    const albums = getAlbums();
    const selected = albums.filter((album) => ids.includes(album.id));
    const pikvn = selected.filter((album) => album.type === 'pikvn').length;
    const warning = pikvn ? `\n\n${pikvn} album pikvn: ảnh trên máy chủ vẫn còn, chỉ xoá dữ liệu album.` : '';
    if (!window.confirm(`Xoá ${ids.length} album? Không thể hoàn tác.${warning}`)) return;
    removeAlbums(ids);
    try {
      await flushStickerStorage();
      rerenderExtras();
      toast(`Đã xoá ${ids.length} album`);
    } catch (error) {
      toast(`Không lưu được thay đổi: ${error.message}`, true);
    }
  });

  albumList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-move-album]');
    if (!button) return;
    const row = button.closest('.sticker-album-row');
    const rows = [...albumList.querySelectorAll('.sticker-album-row')];
    const index = rows.indexOf(row);
    moveAlbum(row.dataset.albumId, index + (button.dataset.moveAlbum === 'up' ? -1 : 1));
    await flushStickerStorage();
    rerenderExtras();
  });

  albumList.addEventListener('dragstart', (event) => {
    const row = event.target.closest('.sticker-album-row');
    if (!row) return;
    draggedId = row.dataset.albumId;
    row.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedId);
  });
  albumList.addEventListener('dragend', () => {
    draggedId = null;
    for (const row of albumList.querySelectorAll('.sticker-album-row')) row.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after');
  });
  albumList.addEventListener('dragover', (event) => {
    if (!draggedId) return;
    event.preventDefault();
    const row = event.target.closest('.sticker-album-row');
    for (const item of albumList.querySelectorAll('.sticker-album-row')) item.classList.remove('is-drop-before', 'is-drop-after');
    if (!row || row.dataset.albumId === draggedId) return;
    const rect = row.getBoundingClientRect();
    row.classList.add(event.clientY < rect.top + rect.height / 2 ? 'is-drop-before' : 'is-drop-after');
  });
  albumList.addEventListener('drop', async (event) => {
    if (!draggedId) return;
    event.preventDefault();
    const row = event.target.closest('.sticker-album-row');
    if (!row) return;
    const rows = [...albumList.querySelectorAll('.sticker-album-row')];
    let targetIndex = rows.indexOf(row);
    const rect = row.getBoundingClientRect();
    if (event.clientY >= rect.top + rect.height / 2) targetIndex += 1;
    const fromIndex = rows.findIndex((item) => item.dataset.albumId === draggedId);
    if (fromIndex < targetIndex) targetIndex -= 1;
    moveAlbum(draggedId, targetIndex);
    draggedId = null;
    await flushStickerStorage();
    rerenderExtras();
  });

  document.getElementById('sticker-recent-clear').addEventListener('click', async () => {
    if (!window.confirm('Xoá toàn bộ sticker gần đây?')) return;
    clearRecentStickers();
    await flushStickerStorage();
    rerenderExtras();
    toast('Đã xoá sticker gần đây');
  });
  return rerenderExtras;
}

// Album editor: rename and reorder the sticker images in one dialog. Opened by the row's
// pencil button (data-rename) or its image-grid button (data-images) — both land here, since
// renaming an album and arranging its stickers are the same task.
function openAlbumEditor(albumId, onChange) {
  const album = getAlbums().find((item) => item.id === albumId);
  if (!album) return;
  const originalName = album.name;
  let images = [...album.images];
  // Reordering is index bookkeeping, so keep a working copy and only write on save.
  let dragFrom = null;

  const body = `
    <div class="formRow">
      <label for="album-edit-name">Tên album</label>
      <input class="input" id="album-edit-name" maxlength="${MAX_NAME}" value="${esc(originalName)}" autocomplete="off">
    </div>
    <div class="formRow">
      <label>Hình ảnh<span class="sticker-images-count" id="album-edit-count"></span></label>
      <p class="formHint">Kéo thả sticker hoặc dùng nút ↑/↓ trên mobile để đổi thứ tự trong bảng chọn sticker.</p>
      <div class="sticker-images-grid" id="album-edit-grid"></div>
    </div>
    <p class="formError" id="album-edit-error" hidden></p>`;

  const { close, root } = openModal('Sửa album sticker', body,
    '<button class="button" type="button" data-cancel>Huỷ</button>' +
    '<button class="button button--primary" type="button" data-save>Lưu thay đổi</button>',
    { className: 'sticker-editor-modal' });

  const grid = root.querySelector('#album-edit-grid');
  const countEl = root.querySelector('#album-edit-count');
  const nameInput = root.querySelector('#album-edit-name');
  const errorEl = root.querySelector('#album-edit-error');
  const showError = (message) => {
    errorEl.textContent = message;
    errorEl.hidden = !message;
  };

  const render = () => {
    grid.replaceChildren();
    countEl.textContent = `${images.length} hình ảnh`;
    images.forEach((img, index) => {
      const cell = document.createElement('div');
      cell.className = 'sticker-images-cell';
      cell.draggable = true;
      cell.dataset.index = String(index);

      const image = document.createElement('img');
      image.src = img.base64 || img.url;
      image.alt = '';
      image.loading = 'lazy';

      const badge = document.createElement('span');
      badge.className = 'sticker-images-index';
      badge.textContent = String(index + 1);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'sticker-remove';
      remove.textContent = '✕';
      remove.setAttribute('aria-label', `Xoá hình ảnh ${index + 1}`);
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!window.confirm(`Xoá hình ảnh #${index + 1}?`)) return;
        images.splice(index, 1);
        render();
      });

      const moveControls = document.createElement('span');
      moveControls.className = 'sticker-image-move-controls';
      for (const [direction, offset, symbol] of [['up', -1, '↑'], ['down', 1, '↓']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sticker-image-move';
        button.textContent = symbol;
        button.disabled = index + offset < 0 || index + offset >= images.length;
        button.setAttribute('aria-label', `${direction === 'up' ? 'Đưa lên' : 'Đưa xuống'} hình ảnh ${index + 1}`);
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const [moved] = images.splice(index, 1);
          images.splice(index + offset, 0, moved);
          render();
        });
        moveControls.append(button);
      }

      cell.addEventListener('dragstart', (event) => {
        dragFrom = index;
        cell.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(index));
      });
      cell.addEventListener('dragend', () => cell.classList.remove('is-dragging'));
      cell.addEventListener('dragover', (event) => { event.preventDefault(); cell.classList.add('is-drop-target'); });
      cell.addEventListener('dragleave', () => cell.classList.remove('is-drop-target'));
      cell.addEventListener('drop', (event) => {
        event.preventDefault();
        cell.classList.remove('is-drop-target');
        // dragFrom is the in-page handle; the dataTransfer fallback covers a drop that
        // arrives without a matching dragstart (e.g. dragged in from another window).
        const from = dragFrom ?? Number(event.dataTransfer.getData('text/plain'));
        if (!Number.isInteger(from) || from === index || from < 0 || from >= images.length) return;
        const [moved] = images.splice(from, 1);
        images.splice(index, 0, moved);
        dragFrom = null;
        render();
      });

      cell.append(image, badge, remove, moveControls);
      grid.append(cell);
    });
  };
  render();
  nameInput.focus();
  nameInput.select();

  root.querySelector('[data-cancel]').addEventListener('click', close);
  root.querySelector('[data-save]').addEventListener('click', async () => {
    const name = nameInput.value.replace(/\s+/g, ' ').trim();
    if (!name) return showError('Tên album không được để trống.');
    if (!images.length) return showError('Album cần ít nhất một hình ảnh. Dùng nút thùng rác ở danh sách để xoá cả album.');
    // Rename first: setAlbumImages only touches images/preview, so the two are independent,
    // but a rejected name must not leave the images half-saved.
    if (name !== originalName) {
      const renamed = renameAlbum(album.id, name);
      if (!renamed.ok) return showError(renamed.error);
    }
    const result = setAlbumImages(album.id, images);
    if (!result.ok) return showError(result.error);
    try {
      await flushStickerStorage();
    } catch (error) {
      return showError(`Không lưu được album: ${error.message}`);
    }
    close();
    onChange();
    toast('Đã lưu album');
  });
}

export function viewSettings() {
  setBreadcrumbs([{ label: 'Diễn đàn', href: '/' }, { label: 'Cài đặt' }]);
  setTitle('Cài đặt');
  app.innerHTML = settingsHtml();
  wireSettingsTabs();

  const list = document.getElementById('shortcut-list');
  const form = document.getElementById('shortcut-form');
  const nameInput = document.getElementById('shortcut-name');
  const urlInput = document.getElementById('shortcut-url');
  const errorEl = document.getElementById('shortcut-error');
  const submitBtn = document.getElementById('shortcut-submit');
  const cancelBtn = document.getElementById('shortcut-cancel');
  const rerenderExtras = wireStickerSettings();
  let editingId = null;
  let draggedId = null;

  // Appearance: theme and font both re-apply immediately. ui/theme.js owns the DOM side and
  // listens for voz:settings, which saveSettings fires — so no reload is needed.
  wireOptionGroup('theme-mode', (value) => {
    setTheme(value);
    toast(`Giao diện: ${THEME_LABELS[value]}`);
  });
  wireOptionGroup('font-family', (value) => {
    setFont(value);
    toast(`Phông chữ: ${FONT_LABELS[value]}`);
  });
  // Size sliders apply on `input` so the page resizes while dragging, but only `change`
  // toasts — otherwise a single drag would fire dozens of them. ui/theme.js re-applies the
  // custom properties from the voz:settings event saveSettings fires.
  wireSizeSlider('size-post', (value) => setFontScale({ ...getFontScale(), postSize: value }));
  wireSizeSlider('size-ui', (value) => setFontScale({ ...getFontScale(), uiSize: value }));
  document.getElementById('image-download')?.addEventListener('change', (event) => {
    const enabled = event.currentTarget.checked;
    setImageDownload(enabled);
    toast(`Tải ảnh: ${enabled ? 'Bật' : 'Tắt'}`);
  });
  document.getElementById('post-screenshot')?.addEventListener('change', (event) => {
    const enabled = event.currentTarget.checked;
    setPostScreenshot(enabled);
    toast(`Nút chụp bài viết: ${enabled ? 'Bật' : 'Tắt'}`);
  });
  document.getElementById('static-avatars')?.addEventListener('change', (event) => {
    const enabled = event.currentTarget.checked;
    setStaticAvatars(enabled);
    toast(`Tắt ảnh động ảnh đại diện: ${enabled ? 'Bật' : 'Tắt'}`);
  });
  wireOptionGroup('infinite-scroll', (value) => {
    setInfiniteScroll(value);
    toast(`Cuộn trang liên tục: ${SCROLL_LABELS[value]}`);
  });
  wireOptionGroup('full-numbers', (value) => {
    setFullNumbers(value);
    toast(`Số liệu không rút gọn: ${FULL_NUMBERS_LABELS[value]}`);
  });

  const showError = (message) => {
    errorEl.textContent = message;
    errorEl.hidden = !message;
  };
  const rerenderList = () => {
    list.innerHTML = shortcutRows();
    const count = document.getElementById('shortcut-count');
    if (count) count.textContent = `${loadSettings().navShortcuts.length} phím tắt`;
  };
  const resetForm = () => {
    editingId = null;
    form.reset();
    submitBtn.textContent = 'Thêm phím tắt';
    cancelBtn.hidden = true;
    showError('');
    nameInput.focus();
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = editingId ? updateShortcut(editingId, { name: nameInput.value, url: urlInput.value }) : addShortcut(nameInput.value, urlInput.value);
    if (!result.ok) return showError(result.error);
    const wasEditing = Boolean(editingId);
    resetForm();
    rerenderList();
    toast(wasEditing ? 'Đã cập nhật phím tắt' : 'Đã thêm phím tắt');
  });

  cancelBtn.addEventListener('click', resetForm);

  list.addEventListener('click', (event) => {
    const moveBtn = event.target.closest('[data-move-shortcut]');
    if (moveBtn) {
      const row = moveBtn.closest('.shortcut-row');
      const rows = [...list.querySelectorAll('.shortcut-row')];
      const index = rows.indexOf(row);
      moveShortcut(row.dataset.shortcutId, index + (moveBtn.dataset.moveShortcut === 'up' ? -1 : 1));
      rerenderList();
      return;
    }
    const editBtn = event.target.closest('[data-edit]');
    if (editBtn) {
      const shortcut = loadSettings().navShortcuts.find((item) => item.id === editBtn.dataset.edit);
      if (!shortcut) return;
      editingId = shortcut.id;
      nameInput.value = shortcut.name;
      urlInput.value = shortcut.url;
      submitBtn.textContent = 'Lưu thay đổi';
      cancelBtn.hidden = false;
      showError('');
      nameInput.focus();
      return;
    }
    const deleteBtn = event.target.closest('[data-delete]');
    if (deleteBtn) {
      removeShortcut(deleteBtn.dataset.delete);
      if (editingId === deleteBtn.dataset.delete) resetForm();
      rerenderList();
      toast('Đã xoá phím tắt');
    }
  });

  // Drag and drop to reorder; drop position is derived from the pointer's vertical midpoint.
  list.addEventListener('dragstart', (event) => {
    const row = event.target.closest('.shortcut-row');
    if (!row) return;
    draggedId = row.dataset.shortcutId;
    row.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedId);
  });
  list.addEventListener('dragend', () => {
    draggedId = null;
    for (const row of list.querySelectorAll('.shortcut-row')) row.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after');
  });
  list.addEventListener('dragover', (event) => {
    if (!draggedId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const row = event.target.closest('.shortcut-row');
    for (const item of list.querySelectorAll('.shortcut-row')) item.classList.remove('is-drop-before', 'is-drop-after');
    if (!row || row.dataset.shortcutId === draggedId) return;
    const rect = row.getBoundingClientRect();
    row.classList.add(event.clientY < rect.top + rect.height / 2 ? 'is-drop-before' : 'is-drop-after');
  });
  list.addEventListener('drop', (event) => {
    if (!draggedId) return;
    event.preventDefault();
    const row = event.target.closest('.shortcut-row');
    if (!row) return;
    const rows = [...list.querySelectorAll('.shortcut-row')];
    let targetIndex = rows.indexOf(row);
    const rect = row.getBoundingClientRect();
    if (event.clientY >= rect.top + rect.height / 2) targetIndex += 1;
    const fromIndex = rows.findIndex((item) => item.dataset.shortcutId === draggedId);
    if (fromIndex < targetIndex) targetIndex -= 1;
    moveShortcut(draggedId, targetIndex);
    draggedId = null;
    rerenderList();
  });

  const jsonBox = document.getElementById('settings-json');
  const jsonError = document.getElementById('settings-json-error');
  const showJsonError = (message) => {
    jsonError.textContent = message;
    jsonError.hidden = !message;
  };

  // Full payload = nav shortcuts + sticker albums + recents, shaped like the userscript
  // backup so either file restores in full.
  const buildBackup = () =>
    exportSettingsJson({
      albums: getAlbums(),
      recent: getRecentStickers(),
    });

  document.getElementById('settings-export').addEventListener('click', () => {
    jsonBox.value = buildBackup();
    showJsonError('');
    toast('Đã xuất JSON thiết lập');
  });
  document.getElementById('settings-download').addEventListener('click', () => {
    const blob = new Blob([buildBackup()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `voz-settings-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Đã tải tệp thiết lập');
  });
  document.getElementById('settings-import').addEventListener('click', async () => {
    const result = importSettingsJson(jsonBox.value);
    if (!result.ok) return showJsonError(result.error);
    showJsonError('');
    resetForm();
    rerenderList();
    const parts = await applyImported(result);
    rerenderList();
    const shortcutPart = result.count ? [`${result.count} phím tắt`] : [];
    const summary = [...shortcutPart, ...parts];
    toast(summary.length ? `Đã phục hồi: ${summary.join(' · ')}` : 'Không có dữ liệu hợp lệ để phục hồi');
  });
  document.getElementById('settings-reset').addEventListener('click', async () => {
    if (!window.confirm('Xoá toàn bộ thiết lập (gồm cả album sticker) trên trình duyệt này?')) return;
    importSettingsJson('{"navShortcuts":[]}');
    for (const album of getAlbums()) removeAlbums([album.id]);
    clearRecentStickers();
    await flushStickerStorage();
    jsonBox.value = buildBackup();
    resetForm();
    rerenderList();
    toast('Đã xoá toàn bộ thiết lập');
  });

  jsonBox.value = buildBackup();
}

// Tab switcher for the settings panels. Panels are toggled with [hidden] and the selection is
// mirrored into the fragment with replaceState, so a reload reopens the same tab without
// pushing a history entry for every click.
function wireSettingsTabs() {
  const list = app.querySelector('.settings-tabs');
  if (!list) return;

  // A legacy fragment (#scroll) opens a different tab than it names; rewrite it so the URL
  // matches the panel on screen instead of leaving a stale id in the address bar.
  const legacy = String(location.hash || '').replace(/^#/, '');
  if (legacy && !TAB_IDS.has(legacy) && TAB_ALIASES[legacy]) {
    try {
      history.replaceState(null, '', `${location.pathname}${location.search}#${TAB_ALIASES[legacy]}`);
    } catch {
      /* the panel is already correct; only the URL lags. */
    }
  }

  const activate = (id, { focus = false } = {}) => {
    if (!TAB_IDS.has(id)) return;
    for (const btn of list.querySelectorAll('[data-tab]')) {
      const on = btn.dataset.tab === id;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
      if (on && focus) btn.focus();
    }
    for (const panel of app.querySelectorAll('.settings-panel')) {
      panel.hidden = panel.id !== `panel-${id}`;
    }
    try {
      history.replaceState(null, '', `${location.pathname}${location.search}#${id}`);
    } catch {
      /* replaceState can fail on a stale entry; the tab still switched, only the URL lags. */
    }
  };

  list.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-tab]');
    if (btn && !btn.classList.contains('is-active')) activate(btn.dataset.tab);
  });

  // Full keyboard support for the tablist: arrows wrap, Home/End jump to the ends.
  list.addEventListener('keydown', (event) => {
    const index = TAB_IDS.size ? [...list.querySelectorAll('[data-tab]')].indexOf(event.target.closest('[data-tab]')) : -1;
    if (index < 0) return;
    const ids = [...list.querySelectorAll('[data-tab]')].map((b) => b.dataset.tab);
    let next = null;
    if (event.key === 'ArrowRight') next = ids[(index + 1) % ids.length];
    else if (event.key === 'ArrowLeft') next = ids[(index - 1 + ids.length) % ids.length];
    else if (event.key === 'Home') next = ids[0];
    else if (event.key === 'End') next = ids[ids.length - 1];
    if (!next) return;
    event.preventDefault();
    activate(next, { focus: true });
  });
}

// Wires one size slider: live preview on `input`, one toast on `change`. Kept beside
// wireOptionGroup so every Giao diện control is handled the same way.
function wireSizeSlider(id, onPick) {
  const input = document.getElementById(id);
  const output = document.getElementById(`${id}-value`);
  if (!input) return;
  input.addEventListener('input', () => {
    const value = Number(input.value);
    if (output) output.textContent = `${value}%`;
    onPick(value);
  });
  input.addEventListener('change', () => {
    toast(`Cỡ chữ: ${input.value}%`);
  });
}

// Wires one radio-card group: writes the value, moves is-active, and toasts. Kept generic so
// the appearance groups and the pager mode all behave identically.
function wireOptionGroup(name, onPick) {
  const group = document.querySelector(`.option-cards input[name="${name}"]`)?.closest('.option-cards');
  if (!group) return;
  group.addEventListener('change', (event) => {
    const input = event.target.closest(`input[name="${name}"]`);
    if (!input) return;
    onPick(input.value);
    for (const label of group.querySelectorAll('.option-card')) {
      label.classList.toggle('is-active', label.querySelector('input').value === input.value);
    }
  });
}
