// Sticker picker, ported from the userscript. It opens the same popup panel the emoji picker uses. Insertion
// format matches voz.vn: [IMG size="80x80"]<url>[/IMG].

import {
  getAlbums, getRecentStickers, addRecentSticker, removeRecentSticker, clearRecentStickers,
  albumToStickerCount, flushStickerStorage, updateAlbum,
} from '../lib/stickers.js';
import { uploadImageFile } from '../lib/pikUpload.js';

const IMG_SIZE = 80;
export const STICKER_BBCODE = (url) => `[IMG size="${IMG_SIZE}x${IMG_SIZE}"]${url}[/IMG]`;

function stickerButton(img, { onPick, onRemove, title }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'sticker-item';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sticker-btn';
  button.title = title || 'Nhấp để chèn';
  const image = document.createElement('img');
  image.src = img.base64 || img.url;
  image.alt = 'sticker';
  image.loading = 'lazy';
  image.onerror = () => {
    image.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect fill="%23f0f0f0" width="80" height="80"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23999" font-size="10">Lỗi</text></svg>';
  };
  button.append(image);
  button.addEventListener('click', () => onPick(img));
  wrapper.append(button);
  if (onRemove) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'sticker-remove';
    remove.innerHTML = '✕';
    remove.title = 'Xoá khỏi gần đây';
    remove.setAttribute('aria-label', 'Xoá khỏi gần đây');
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      onRemove(img);
    });
    wrapper.append(remove);
  }
  return wrapper;
}

// Renders the picker into `panel`. `insert(code)` injects BBCode at the caret; the panel stays open so several
// stickers can be inserted in a row.
export function renderStickerPicker(panel, insert) {
  panel.innerHTML = `
    <div class="sticker-picker">
      <div class="sticker-tabs" role="tablist"></div>
      <div class="sticker-grid" role="tabpanel"></div>
      <div class="sticker-foot">
        <span class="sticker-status" role="status"></span>
        <a class="sticker-manage" href="/cai-dat-tuivoz#stickers">Quản lý sticker</a>
      </div>
    </div>`;
  const tabs = panel.querySelector('.sticker-tabs');
  const grid = panel.querySelector('.sticker-grid');
  const status = panel.querySelector('.sticker-status');

  let activeKey = null;

  const pick = async (img) => {
    if (/^data:image\//i.test(img.url || '')) {
      status.textContent = 'Đang tải sticker lên pik.vn…';
      try {
        const blob = await (await fetch(img.url)).blob();
        const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
        const uploaded = await uploadImageFile(new File([blob], `sticker.${extension}`, { type: blob.type }));
        const oldUrl = img.url;
        img.url = uploaded.url;
        img.deleteUrl = uploaded.deleteUrl || '';
        for (const album of getAlbums()) {
          const index = album.images.findIndex((image) => image.url === oldUrl);
          if (index < 0) continue;
          const images = [...album.images];
          images[index] = { ...images[index], url: img.url, deleteUrl: img.deleteUrl };
          updateAlbum(album.id, { images });
          break;
        }
      } catch (error) {
        status.textContent = `Tải sticker lên pik.vn thất bại: ${error.message}`;
        return;
      }
    }
    addRecentSticker(img.url, img.base64 || null);
    try {
      await flushStickerStorage();
    } catch (error) {
      status.textContent = `Không lưu được sticker gần đây: ${error.message}`;
    }
    insert(STICKER_BBCODE(img.url));
    status.textContent = 'Đã chèn sticker.';
    // Refresh the recents tab so the picked sticker moves to the front.
    if (activeKey === 'recent') render('recent');
    renderTabs();
  };

  function render(key) {
    activeKey = key;
    grid.replaceChildren();
    if (key === 'recent') {
      const recent = getRecentStickers();
      if (!recent.length) {
        grid.innerHTML = '<p class="sticker-empty">Chưa có sticker nào. Nhấp một sticker trong album để dùng.</p>';
        return;
      }
      for (const img of recent) {
        grid.append(
          stickerButton(img, {
            onPick: pick,
            onRemove: async (target) => {
              removeRecentSticker(target.url);
              await flushStickerStorage();
              render('recent');
              renderTabs();
            },
          })
        );
      }
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'sticker-clear-all';
      // Icon only, like the per-sticker remove badge; the tooltip explains it.
      clear.textContent = '🗑️';
      clear.title = 'Xoá hết gần đây';
      clear.setAttribute('aria-label', 'Xoá hết sticker gần đây');
      clear.addEventListener('click', async () => {
        if (!window.confirm('Bạn có chắc muốn xóa tất cả sticker gần đây?')) return;
        clearRecentStickers();
        await flushStickerStorage();
        render('recent');
        renderTabs();
      });
      grid.append(clear);
      return;
    }
    const album = getAlbums().find((item) => item.id === key);
    if (!album) {
      grid.innerHTML = '<p class="sticker-empty">Album không tồn tại.</p>';
      return;
    }
    if (!album.images.length) {
      grid.innerHTML = '<p class="sticker-empty">Album trống.</p>';
      return;
    }
    for (const img of album.images) grid.append(stickerButton(img, { onPick: pick }));
  }

  function renderTabs() {
    tabs.replaceChildren();
    const recent = getRecentStickers();
    const entries = [];
    if (recent.length) entries.push({ key: 'recent', label: `Gần đây (${recent.length})` });
    for (const album of getAlbums()) entries.push({ key: album.id, label: `${album.name} (${albumToStickerCount(album)})` });
    if (!entries.length) {
      tabs.hidden = true;
      grid.innerHTML = '<p class="sticker-empty">Chưa có album sticker nào. Vào <strong>Cài đặt → Sticker</strong> để thêm album imgur hoặc tạo album mới.</p>';
      status.textContent = '';
      return;
    }
    tabs.hidden = false;
    const wanted = entries.some((entry) => entry.key === activeKey) ? activeKey : entries[0].key;
    for (const entry of entries) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = `sticker-tab${entry.key === wanted ? ' is-active' : ''}`;
      tab.textContent = entry.label;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(entry.key === wanted));
      tab.addEventListener('click', () => {
        render(entry.key);
        renderTabs();
      });
      tabs.append(tab);
    }
    if (activeKey !== wanted) render(wanted);
  }

  renderTabs();
}
