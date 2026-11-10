import { esc } from '../core/utils.js';
import { safeEditorUrl } from '../lib/editorCodec.js';
import { loadSmilies, smilieChoices } from '../lib/smilies.js';
import { renderStickerPicker } from './stickerPicker.js';
import { uploadImageFiles, pikBbcode } from '../lib/pikUpload.js';

// Original SVG artwork; the grouping follows the forum's editor conventions.
const paths = {
  bold: 'M7 4h6a4 4 0 0 1 0 8H7m0-8v16h7a4 4 0 0 0 0-8H7',
  italic: 'M10 4h8M6 20h8M14 4 10 20', underline: 'M6 4v8a6 6 0 0 0 12 0V4M4 21h16',
  strikeThrough: 'M18 6c-3-4-11-2-11 2 0 2 3 3 5 4m-6 6c3 4 12 2 11-2M3 12h18',
  list: 'M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1', ordered: 'M9 6h12M9 12h12M9 18h12M3 4v5M2 14c4-3 5 1 1 4h3',
  url: 'm10 14 4-4M8 16l-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 6 0m0 8a4 4 0 0 0 6 0l5-5a4 4 0 0 0-5-5l-2 2',
  img: 'M3 4h18v16H3zM3 16l5-5 4 4 3-3 6 6M16 8h.01', media: 'M4 4h16v16H4zM10 8l6 4-6 4z',
  quote: 'M4 6h6v7H5c0 3 1 4 4 5M14 6h6v7h-5c0 3 1 4 4 5',
  spoiler: 'M3 5h18v14H3zM7 9h10M7 13h6', ispoiler: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M4 3l16 18',
  code: 'm8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18', icode: 'm8 8-4 4 4 4m8-8 4 4-4 4',
  smilies: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M8 9h.01M16 9h.01M7 14q5 6 10 0',
  stickers: 'M4 4h16v10l-6 6H4zM20 14h-4a2 2 0 0 0-2 2v4M9 9h.01M15 9h.01',
  table: 'M3 4h18v16H3zM3 10h18M9 4v16M15 4v16', hr: 'M3 12h18',
  undo: 'M8 4 3 9l5 5M3 9h11a6 6 0 0 1 0 12', redo: 'm16 4 5 5-5 5M21 9H10a6 6 0 0 0 0 12',
  clear: 'M4 5h15M12 5 8 19m7-5 6 6m0-6-6 6', mode: 'm7 4-4 8 4 8m10-16 4 8-4 8M14 3l-4 18',
  preview: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  more: 'M5 11h.01M12 11h.01M19 11h.01', size: 'M3 5h12M9 5v15M15 11h7M18 11v9',
  color: 'm5 17 7-14 7 14M8 12h8M3 21h18', font: 'M5 20 12 4l7 16M8 14h8', align: 'M3 5h18M3 10h12M3 15h18M3 20h12',
  paragraph: 'M14 21V3h-4a5 5 0 0 0 0 10h4M19 3v18M10 3h12',
};
export const editorIcon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name] || paths.more}"/></svg>`;
const labels = { bold: 'Đậm', italic: 'Nghiêng', underline: 'Gạch chân', strikeThrough: 'Gạch ngang', list: 'Danh sách', ordered: 'Danh sách số', url: 'Liên kết', img: 'Ảnh từ URL', media: 'Media từ URL', quote: 'Trích dẫn', spoiler: 'Spoiler', ispoiler: 'Spoiler trong dòng', code: 'Mã nguồn', icode: 'Mã trong dòng', smilies: 'Emoji', stickers: 'Sticker', table: 'Bảng', hr: 'Đường kẻ', undo: 'Hoàn tác', redo: 'Làm lại', clear: 'Xoá định dạng đoạn chọn', mode: 'Chuyển chế độ BBCode', preview: 'Xem trước', size: 'Cỡ chữ to' };
const panelTools = ['url', 'img', 'media', 'table', 'spoiler', 'quote', 'smilies', 'stickers'];
const button = (tool) => `<button type="button" data-tool="${tool}" title="${labels[tool]}" aria-label="${labels[tool]}"${tool === 'mode' ? ' aria-pressed="false"' : tool === 'preview' || panelTools.includes(tool) ? ' aria-expanded="false"' : ''}>${editorIcon(tool)}</button>`;
export { panelTools };
export function editorToolbar(id) {
  const more = (name, label) => `<button type="button" class="editor-more" data-menu="${name}" aria-label="${label}" title="${label}" aria-expanded="false" aria-controls="${esc(id)}-${name}">${editorIcon('more')}</button>`;
  const option = (name, label, content) => `<label class="editor-option" title="${label}">${editorIcon(name)}${content}</label>`;
  return `<div class="editor-toolbar" role="toolbar" aria-label="Định dạng nội dung">
    <div class="editor-group">${button('bold')}${button('italic')}${more('text', 'Thêm định dạng chữ')}</div>
    <div class="editor-group">${button('url')}${button('img')}${more('rich', 'Thêm nội dung')}</div>
    <div class="editor-group">${['quote','ispoiler','smilies','stickers'].map(button).join('')}</div>
    <div class="editor-group editor-history">${button('undo')}${more('misc', 'Thêm công cụ')}</div>
    <div class="editor-group editor-preview-toggle">${button('preview')}</div>
    <div class="editor-overflow" id="${esc(id)}-text" data-menu-panel="text" hidden>
      ${option('size', 'Cỡ chữ', '<select data-option="size" aria-label="Cỡ chữ"><option value="">Cỡ chữ</option>' + [1,2,3,4,5,6,7].map(n => `<option>${n}</option>`).join('') + '</select>')}
      ${option('color', 'Màu chữ', '<input type="color" data-option="color" value="#223366" aria-label="Màu chữ">')}
      ${option('font', 'Phông chữ', '<select data-option="font" aria-label="Phông chữ"><option value="">Phông chữ</option><option>Arial</option><option>Georgia</option><option>Times New Roman</option><option>Verdana</option><option>Courier New</option></select>')}
      ${button('list')}${button('ordered')}
      ${option('align', 'Căn đoạn', '<select data-option="align" aria-label="Căn đoạn"><option value="">Căn đoạn</option><option value="left">Trái</option><option value="center">Giữa</option><option value="right">Phải</option><option value="justify">Đều</option></select>')}
      ${option('paragraph', 'Định dạng đoạn', '<select data-option="paragraph" aria-label="Định dạng đoạn"><option value="">Định dạng đoạn</option><option value="normal">Văn bản thường</option><option value="large">Tiêu đề</option></select>')}
      ${['strikeThrough','underline','icode','size'].map(button).join('')}
    </div>
    <div class="editor-overflow" id="${esc(id)}-rich" data-menu-panel="rich" hidden>${['media','table','hr','spoiler','code'].map(button).join('')}</div>
    <div class="editor-overflow editor-misc" id="${esc(id)}-misc" data-menu-panel="misc" hidden>
      <div class="editor-menu-icons">${['redo','mode','clear'].map(button).join('')}</div>
      <div class="editor-drafts"><button type="button" data-tool="restore">Khôi phục nháp</button><button type="button" data-tool="discard">Xoá nháp</button></div>
      <p class="editor-hint">Nháp trên thiết bị này: 30 ngày. Dán hoặc kéo thả ảnh để tải lên pik.vn. Xem trước cục bộ có thể khác voz.vn.</p>
    </div>
  </div>`;
}

// Compact pik.vn upload strip inside the shared image panel. Uploads files and inserts them as [IMG]; the panel
// stays open after a batch, like the sticker picker.
function renderUploadStrip(container, insert) {
  container.innerHTML = `
    <div class="editor-upload">
      <label class="editor-upload-drop">
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif" multiple hidden>
        <span>Chọn ảnh hoặc kéo thả vào đây</span>
      </label>
      <div class="editor-upload-status" role="status"></div>
      <ul class="editor-upload-list"></ul>
    </div>`;
  const input = container.querySelector('input[type=file]');
  const drop = container.querySelector('.editor-upload-drop');
  const status = container.querySelector('.editor-upload-status');
  const list = container.querySelector('.editor-upload-list');

  let busy = false;
  const row = (text, tone = '') => {
    const item = document.createElement('li');
    item.className = `editor-upload-row${tone ? ` is-${tone}` : ''}`;
    item.textContent = text;
    list.prepend(item);
    return item;
  };

  const handle = async (files) => {
    if (busy || !files?.length) return;
    busy = true;
    drop.classList.add('is-busy');
    list.replaceChildren();
    status.textContent = 'Đang tải ảnh lên…';
    try {
      const { results, skipped } = await uploadImageFiles(files, (done, total) => {
        status.textContent = `Đang tải ảnh lên… ${done}/${total}`;
      });
      const ok = results.filter((result) => result.ok && result.url);
      if (ok.length) insert(ok.map((result) => pikBbcode(result.url)).join('\n'));
      for (const result of ok) row(`${result.file.name || 'ảnh'} → đã chèn`, 'ok');
      for (const result of results.filter((item) => !item.ok)) row(`${result.file.name || 'ảnh'} → ${result.error}`, 'error');
      if (skipped) row(`${skipped} tệp không phải ảnh đã bỏ qua`, 'error');
      status.textContent = ok.length ? `Đã chèn ${ok.length} ảnh.` : 'Không chèn được ảnh nào.';
    } catch (error) {
      status.textContent = error.message || 'Tải ảnh lên thất bại.';
    } finally {
      busy = false;
      drop.classList.remove('is-busy');
      input.value = '';
    }
  };

  input.addEventListener('change', () => handle(input.files));
  for (const type of ['dragenter', 'dragover']) drop.addEventListener(type, (event) => { event.preventDefault(); drop.classList.add('is-over'); });
  for (const type of ['dragleave', 'drop']) drop.addEventListener(type, () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (event) => { event.preventDefault(); handle(event.dataTransfer?.files); });
}

export function showToolPanel(panel, kind, insert, selectionText) {
  panel.hidden = false;
  // Not data-tool: the panel would then match the editor's toolbar button lookup.
  panel.dataset.panelKind = kind;
  const close = () => panel.dispatchEvent(new Event('editor:panel-close'));
  const add = (code) => { insert(code); close(); };
  if (kind === 'stickers') {
    renderStickerPicker(panel, insert);
    return;
  }
  if (kind === 'smilies') {
    panel.innerHTML = '<div class="editor-smilies"></div><button type="button" data-dismiss>Đóng</button>';
    panel.querySelector('[data-dismiss]').onclick = close;
    const grid = panel.querySelector('.editor-smilies');
    const choice = (smilie, code) => {
      const label = smilie.title;
      const button = document.createElement('button'); button.type = 'button'; button.title = label; button.setAttribute('aria-label', label);
      if (smilie.image_url && safeEditorUrl(smilie.image_url)) {
        const img = document.createElement('img');
        img.src = smilie.image_url;
        img.alt = code;
        img.loading = 'lazy';
        // voz.vn caps picker smilies at 32px; the 2x variant stays sharp on hi-dpi.
        if (smilie.image_url_2x && safeEditorUrl(smilie.image_url_2x)) img.srcset = `${smilie.image_url} 1x, ${smilie.image_url_2x} 2x`;
        button.append(img);
      } else button.textContent = code;
      // Keep the picker open so several emoji can be inserted in a row.
      button.onclick = () => insert(code);
      grid.append(button);
    };
    const message = document.createElement('span'); message.textContent = 'Đang tải emoji VOZ…'; grid.append(message);
    loadSmilies().then(() => {
      if (!grid.isConnected) return;
      message.textContent = smilieChoices().length ? '' : 'Không tải được emoji VOZ.';
      for (const smilie of smilieChoices()) if (smilie.codes?.[0]) choice(smilie, smilie.codes[0]);
    });
    return;
  }
  const urlTool = ['url', 'img', 'media'].includes(kind);
  const fields = urlTool ? `<label>URL http(s)<input data-field="url" type="url" placeholder="https://…" value="${esc(/^https?:\/\//i.test(selectionText) ? selectionText : '')}"></label>${kind === 'url' ? `<label>Văn bản liên kết<input data-field="label" value="${esc(selectionText)}"></label>` : ''}`
    : kind === 'table' ? '<label>Hàng<input data-field="rows" type="number" min="1" max="20" value="2"></label><label>Cột<input data-field="cols" type="number" min="1" max="10" value="2"></label>'
      : `<label>${kind === 'spoiler' ? 'Tiêu đề spoiler' : 'Tác giả (không bắt buộc)'}<input data-field="label"></label>`;
  // "Ảnh từ URL" also accepts files, so the upload strip shares the panel.
  const upload = kind === 'img' ? '<div class="editor-upload-slot"></div>' : '';
  panel.innerHTML = `${fields}<button type="button" data-insert>Chèn</button><button type="button" data-dismiss>Huỷ</button><span role="alert"></span>${upload}`;
  panel.querySelector('[data-dismiss]').onclick = close;
  if (kind === 'img') renderUploadStrip(panel.querySelector('.editor-upload-slot'), insert);
  panel.querySelector('[data-insert]').onclick = () => {
    const get = (key) => panel.querySelector(`[data-field="${key}"]`)?.value.trim() || '';
    if (urlTool) {
      const url = safeEditorUrl(get('url'));
      if (!url) { panel.querySelector('[role="alert"]').textContent = 'Chỉ chấp nhận URL http(s) hợp lệ, không có thông tin đăng nhập.'; return; }
      if (kind === 'media') {
        const parsed = new URL(url);
        let site, key;
        if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(parsed.hostname)) {
          site = 'youtube'; key = parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v') || parsed.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)/)?.[1];
          if (!/^[\w-]{11}$/.test(key || '')) key = null;
        } else if (['twitter.com', 'www.twitter.com', 'x.com', 'www.x.com'].includes(parsed.hostname)) {
          site = 'twitter'; key = parsed.pathname.match(/\/status\/(\d+)/)?.[1];
        } else if (['tiktok.com', 'www.tiktok.com'].includes(parsed.hostname)) {
          site = 'tiktok'; key = parsed.pathname.match(/\/video\/(\d+)/)?.[1];
        } else if (['reddit.com', 'www.reddit.com'].includes(parsed.hostname)) {
          site = 'reddit'; key = parsed.pathname.match(/^\/r\/(\w+\/comments\/[a-z0-9]+(?:\/[\w-]*)?)/i)?.[1];
        } else if (['imgur.com', 'www.imgur.com', 'i.imgur.com', 'm.imgur.com'].includes(parsed.hostname)) {
          site = 'imgur'; key = parsed.pathname.match(/^\/(?:gallery\/|a\/)?([\w-]{5,12})(?:\.[a-z0-9]+)?\/?(?:embed)?\/?$/i)?.[1];
          if (!/^[\w-]{5,12}$/.test(key || '')) key = null;
        }
        if (!key) { panel.querySelector('[role="alert"]').textContent = 'Hỗ trợ URL YouTube, X/Twitter, TikTok, Reddit, Imgur. Với nguồn khác, dùng Liên kết.'; return; }
        add(`[MEDIA=${site}]${key}[/MEDIA]`);
      } else add(kind === 'url' ? `[URL=${url}]${get('label') || url}[/URL]` : `[IMG]${url}[/IMG]`);
    } else if (kind === 'table') {
      const rows = Number(get('rows')), cols = Number(get('cols'));
      if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || rows > 20 || cols < 1 || cols > 10) { panel.querySelector('[role="alert"]').textContent = 'Bảng: 1–20 hàng, 1–10 cột.'; return; }
      add(`[TABLE]${Array.from({ length: rows }, () => `[TR]${'[TD]…[/TD]'.repeat(cols)}[/TR]`).join('')}[/TABLE]\n`);
    } else {
      const label = get('label').replace(/[\[\]"\r\n]/g, '');
      add(`[${kind.toUpperCase()}${label ? `="${label}"` : ''}]${selectionText || '…'}[/${kind.toUpperCase()}]\n`);
    }
  };
  panel.querySelector('input')?.focus();
}
