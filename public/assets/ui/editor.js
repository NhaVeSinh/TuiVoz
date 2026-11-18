// The textarea remains the canonical, synchronous BBCode interface for every view.
import { esc } from '../core/utils.js';
import { state } from '../core/dom.js';
import { editorCodeHtml, editorDomCode, editorCodePlain } from '../lib/editorCodec.js';
import { loadSmilies, smiliesReady, renderSmilies } from '../lib/smilies.js';
import { editorToolbar, showToolPanel, panelTools } from './editorTools.js';
import { attachImageResizer } from './imageResizer.js';
import { openMentionMenu, mentionContext } from './mentionMenu.js';
import { uploadImageFiles, pikBbcode } from '../lib/pikUpload.js';
import { AttachmentUploads, attachmentSupported, ATTACH_ACCEPT } from '../lib/uploadAttachments.js';

// `context` pins the attachment key to its target, e.g. { thread_id } for a reply or { node_id } for a new
// thread — the same values the app posts in `context[...]` to /attachments/new-key.
export function editorHtml(id, value = '', placeholder = 'Nội dung…', context) {
  const attach = context && typeof context === 'object'
    ? ` data-attach-context="${esc(JSON.stringify(context))}"`
    : '';
  return `<div class="rich-editor" data-editor-id="${esc(id)}"${attach}>
    ${editorToolbar(id)}
    <div class="editor-panel" hidden></div>
    <textarea class="textarea editor-source" id="${esc(id)}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}">${esc(value)}</textarea>
    <div class="editor-visual" role="textbox" aria-multiline="true" aria-label="${esc(placeholder)}" data-placeholder="${esc(placeholder)}" contenteditable="true" hidden></div>
    <div class="editor-preview bbWrapper" aria-label="Xem trước cục bộ" hidden></div>
    <ul class="mention-menu" role="listbox" aria-label="Gợi ý thành viên" hidden></ul>
    <span role="status" class="editor-status"></span>
  </div>`;
}

export function clearEditorDraft(textarea) { textarea?.dispatchEvent(new Event('editor:clear-draft')); }

export function wireEditor(container) {
  for (const editor of container.querySelectorAll('.rich-editor')) {
    if (editor.dataset.wired) continue;
    try {
      wireOneEditor(editor);
    } catch (error) {
      console.error('[editor] wireEditor failed', error);
      delete editor.dataset.wired;
    }
  }
}

function wireOneEditor(editor) {
  {
    editor.dataset.wired = 'true';
    const textarea = editor.querySelector('textarea');
    const visual = editor.querySelector('.editor-visual');
    const panel = editor.querySelector('.editor-panel');
    const preview = editor.querySelector('.editor-preview');
    const status = editor.querySelector('.editor-status');
    const mentionList = editor.querySelector('.mention-menu');
    attachImageResizer(editor, visual);
    const native = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    let sourceMode = false, savedRange = null, sourceSelection = [0, 0], composing = false;
    const history = [textarea.value]; let position = 0;
    // Page numbers must not split reply drafts; post edits have an explicit identity.
    const draftKey = `voz-editor:v1:${state.me?.user_id || 'guest'}:${location.pathname.replace(/\/page-\d+\/?$/, '/')}:${editor.dataset.draftContext || textarea.id}`;
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(draftKey)); if (!stored || Date.now() - stored.date > 30 * 86400000) { localStorage.removeItem(draftKey); stored = null; } } catch { /* Storage may be disabled. */ }
    const restoreButton = editor.querySelector('[data-tool="restore"]');
    restoreButton.disabled = !stored?.value;
    if (stored?.value) status.textContent = 'Có bản nháp cục bộ. Nhấn Khôi phục nháp để mở.';
    const value = () => native.get.call(textarea);
    // Smilies are images in the visual editor but their code in the textarea, so the caret is tracked against a
    // virtual text where an image counts as its code.
    const virtualLength = (node) => {
      if (node.nodeType === 3) return node.nodeValue.length;
      // cloneContents() returns a DocumentFragment (nodeType 11), not an element.
      if (node.nodeType !== 1 && node.nodeType !== 11) return 0;
      if (node.dataset?.smilie) return node.dataset.smilie.length;
      if (node.tagName === 'BR') return 1;
      let total = 0;
      for (const child of node.childNodes) total += virtualLength(child);
      return total;
    };
    const caretOffset = () => {
      const selection = document.getSelection();
      if (!selection?.rangeCount) return null;
      const range = selection.getRangeAt(0);
      if (!visual.contains(range.startContainer)) return null;
      // Measure everything before the caret; this also works when the caret sits on the editor element itself.
      const before = document.createRange();
      before.selectNodeContents(visual);
      before.setEnd(range.startContainer, range.startOffset);
      return virtualLength(before.cloneContents());
    };
    const restoreCaret = (offset) => {
      if (offset === null) return;
      const selection = document.getSelection();
      if (!selection) return;
      const range = document.createRange();
      let remaining = offset;
      let placed = false;
      const walk = (node) => {
        if (placed) return;
        if (node.nodeType === 3) {
          const length = node.nodeValue.length;
          if (remaining <= length) { range.setStart(node, remaining); placed = true; return; }
          remaining -= length; return;
        }
        if (node.nodeType !== 1) return;
        if (node.dataset.smilie) {
          const length = node.dataset.smilie.length;
          if (remaining <= length) { range.setStartAfter(node); placed = true; return; }
          remaining -= length; return;
        }
        if (node.tagName === 'BR') {
          if (remaining === 0) { range.setStartBefore(node); placed = true; return; }
          remaining -= 1; return;
        }
        if (remaining === 0) { range.setStart(node, 0); placed = true; return; }
        for (const child of node.childNodes) { walk(child); if (placed) return; }
      };
      walk(visual);
      if (!placed) { range.selectNodeContents(visual); range.collapse(false); }
      else range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      if (visual.contains(range.startContainer)) savedRange = range.cloneRange();
    };
    const render = () => { visual.innerHTML = editorCodeHtml(value()); renderSmilies(visual); };
    const refreshPreview = () => { if (!preview.hidden) { preview.innerHTML = editorCodeHtml(value(), true); renderSmilies(preview); } };
    // An emoji shows its image immediately. The caret is only re-placed when a text node was replaced, or it
    // would fight the browser's own caret.
    const liveSmilies = () => {
      if (sourceMode || !smiliesReady() || !visual.isConnected) return;
      const offset = caretOffset();
      if (renderSmilies(visual) && offset !== null) restoreCaret(offset);
    };
    // The catalogue arrives asynchronously; redraw once so drafted codes become images.
    loadSmilies().then(() => { if (!sourceMode && visual.isConnected) liveSmilies(); });
    const save = () => {
      try {
        if (value()) { stored = { value: value(), date: Date.now() }; localStorage.setItem(draftKey, JSON.stringify(stored)); status.textContent = 'Đã lưu nháp trên trình duyệt này (30 ngày).'; }
        else { localStorage.removeItem(draftKey); stored = null; status.textContent = 'Nội dung trống · Không có nháp.'; }
        restoreButton.disabled = !stored?.value;
      } catch { status.textContent = 'Không thể lưu nháp trên trình duyệt này.'; }
    };
    const record = () => {
      if (history[position] !== value()) { history.splice(position + 1); history.push(value()); if (history.length > 100) history.shift(); position = history.length - 1; }
      editor.querySelector('[data-tool="undo"]').disabled = position === 0;
      editor.querySelector('[data-tool="redo"]').disabled = position === history.length - 1;
      save(); refreshPreview();
    };    const set = (next, remember = true) => { native.set.call(textarea, String(next)); render(); savedRange = null; if (remember) record(); else { save(); refreshPreview(); } };
    // Existing quote/reply code assigns .value without dispatching input events.
    Object.defineProperty(textarea, 'value', { configurable: true, get: value, set: (next) => set(next) });
    const nativeFocus = textarea.focus.bind(textarea);
    textarea.focus = (options) => { if (sourceMode) nativeFocus(options); else visual.focus(options); };
    const rememberSelection = () => {
      if (sourceMode) { sourceSelection = [textarea.selectionStart, textarea.selectionEnd]; return; }
      const selection = document.getSelection();
      if (selection?.rangeCount && visual.contains(selection.anchorNode) && visual.contains(selection.focusNode)) savedRange = selection.getRangeAt(0).cloneRange();
    };
    const range = () => {
      visual.focus();
      const result = savedRange && visual.contains(savedRange.commonAncestorContainer) ? savedRange : document.createRange();
      if (result !== savedRange) { result.selectNodeContents(visual); result.collapse(false); }
      const selection = document.getSelection(); selection.removeAllRanges(); selection.addRange(result); return result;
    };
    const selected = (plain = false) => {
      if (sourceMode) return value().slice(...sourceSelection);
      const fragment = document.createElement('div'); fragment.append(range().cloneContents());
      return plain ? fragment.textContent : editorDomCode(fragment);
    };
    const insert = (code, plain = false) => {
      if (sourceMode) {
        const [start, end] = sourceSelection;
        const next = value().slice(0, start) + code + value().slice(end);
        set(next); nativeFocus(); textarea.setSelectionRange(start + code.length, start + code.length); rememberSelection();
      } else {
        const target = range(); target.deleteContents();
        const fragment = plain ? document.createDocumentFragment() : target.createContextualFragment(editorCodeHtml(code));
        if (plain) fragment.append(document.createTextNode(code));
        const last = fragment.lastChild;
        target.insertNode(fragment);
        if (last) { target.setStartAfter(last); target.collapse(true); const selection = document.getSelection(); selection.removeAllRanges(); selection.addRange(target); savedRange = target.cloneRange(); }
        native.set.call(textarea, editorDomCode(visual)); record();
        // The inserted BBCode may be a smilie code: show its image right away. liveSmilies() re-places the
        // caret, so repeated picks keep their order.
        if (!plain) liveSmilies();
      }
    };
    const wrap = (tag, attrs = '') => insert(`[${tag}${attrs}]${selected() || '…'}[/${tag}]`);
    // The menu writes into the visual editor, so the textarea and the draft follow through `record()`.
    const mention = openMentionMenu({
      ed: visual,
      list: mentionList,
      commit: (username) => {
        const selection = document.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        const node = range?.startContainer;
        const ctx = range && node?.nodeType === 3 ? mentionContext(node.nodeValue, range.startOffset) : null;
        visual.focus();
        if (range && ctx) {
          range.setStart(node, ctx.start);
          range.setEnd(node, ctx.end);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        document.execCommand('insertText', false, `@${username} `);
        native.set.call(textarea, editorDomCode(visual));
        record();
      },
    });
    const undo = (direction) => {
      const next = position + direction;
      if (next < 0 || next >= history.length) return;
      position = next; set(history[position], false);
      editor.querySelector('[data-tool="undo"]').disabled = position === 0;
      editor.querySelector('[data-tool="redo"]').disabled = position === history.length - 1;
    };
    const closeMenus = () => {
      for (const menu of editor.querySelectorAll('[data-menu-panel]')) {
        menu.hidden = true;
        menu.style.height = '';
        menu.classList.remove('is-open');
      }
      for (const toggle of editor.querySelectorAll('[data-menu]')) {
        toggle.setAttribute('aria-expanded', 'false');
        toggle.classList.remove('is-open');
      }
    };
    // voz.vn slides the extra buttons open as a second row inside the toolbar; the height is animated so the
    // editor below moves down smoothly instead of jumping.
    const openMenu = (toggle, menu) => {
      menu.hidden = false;
      const height = menu.scrollHeight;
      menu.style.height = '0px';
      requestAnimationFrame(() => {
        menu.classList.add('is-open');
        menu.style.height = `${height}px`;
      });
    };
    const closePanel = () => {
      panel.hidden = true; panel.replaceChildren(); delete panel.dataset.panelKind;
      for (const tool of editor.querySelectorAll('[data-tool][aria-expanded="true"]')) tool.setAttribute('aria-expanded', 'false');
    };
    // The emoji popup sits under the toolbar, whose height changes when the buttons wrap on narrow screens.
    const syncPanelOffset = () => {
      const toolbar = editor.querySelector('.editor-toolbar');
      if (toolbar) editor.style.setProperty('--editor-toolbar-h', `${Math.round(toolbar.getBoundingClientRect().height)}px`);
    };
    syncPanelOffset();
    if (typeof ResizeObserver === 'function') new ResizeObserver(syncPanelOffset).observe(editor.querySelector('.editor-toolbar'));
    panel.addEventListener('editor:panel-close', closePanel);
    const outsidePointer = (event) => {
      if (!editor.isConnected) { document.removeEventListener('pointerdown', outsidePointer); return; }
      if (!event.target.closest('.mention-menu')) mention.close();
      if (event.target.closest('.editor-toolbar, .editor-panel')?.closest('.rich-editor') === editor) return;
      // The emoji and sticker pickers stay open until their own toolbar button is pressed again; they cover a lot
      // of the screen on mobile, so an outside tap is the only other way to dismiss them.
      if (['smilies', 'stickers'].includes(panel.dataset.panelKind) && !panel.hidden) { closeMenus(); return; }
      closeMenus(); closePanel();
    };
    document.addEventListener('pointerdown', outsidePointer);
    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (mention.isOpen()) { event.stopPropagation(); return; }
        const toggle = editor.querySelector('[data-menu][aria-expanded="true"]');
        closeMenus(); closePanel(); toggle?.focus();
      }
    });
    // A closed row keeps a stale pixel height, so the next open would start from the wrong value.
    editor.addEventListener('transitionend', (event) => {
      if (event.propertyName !== 'height') return;
      const menu = event.target.closest?.('[data-menu-panel]');
      if (menu && !menu.hidden && menu.classList.contains('is-open')) menu.style.height = 'auto';
    });
    editor.addEventListener('pointerdown', (event) => {
      const option = event.target.closest('.mention-menu li[data-username]');
      if (option && mentionList.contains(option)) {
        // Keep the editor from taking the caret back before the click lands.
        event.preventDefault();
        event.stopPropagation();
        mention.choose([...mentionList.children].indexOf(option));
        return;
      }
      if (event.target.closest('.editor-toolbar')) { rememberSelection(); if (event.target.closest('button')) event.preventDefault(); }
    });
    for (const surface of [visual, textarea]) {
      surface.addEventListener('keyup', rememberSelection); surface.addEventListener('mouseup', rememberSelection); surface.addEventListener('blur', rememberSelection);
      surface.addEventListener('input', () => {
        if (composing) return;
        if (surface === visual) native.set.call(textarea, editorDomCode(visual)); else render();
        rememberSelection(); record();
        // Typing a smilie code shows the image immediately.
        if (surface === visual) liveSmilies();
        // @name suggestions only exist while the member is typing them.
        if (surface === visual) mention.update();
      });
      surface.addEventListener('compositionstart', () => { composing = true; });
      surface.addEventListener('compositionend', () => { composing = false; surface.dispatchEvent(new Event('input', { bubbles: true })); });
      surface.addEventListener('beforeinput', (event) => { if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') { event.preventDefault(); undo(event.inputType === 'historyUndo' ? -1 : 1); } });
      surface.addEventListener('keydown', (event) => {
        // Arrow keys, Enter, Tab and Escape belong to the open @mention list; Ctrl+Z stays with the editor.
        if (surface === visual && !event.ctrlKey && !event.metaKey && !event.altKey && !composing && mention.key(event)) return;
        if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) { event.preventDefault(); undo(event.key.toLowerCase() === 'y' || event.shiftKey ? 1 : -1); }
        if ((event.ctrlKey || event.metaKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase()) && !sourceMode) {
          event.preventDefault(); rememberSelection(); document.execCommand({ b: 'bold', i: 'italic', u: 'underline' }[event.key.toLowerCase()]); native.set.call(textarea, editorDomCode(visual)); record();
        }
      });
    }
    // Native voz attachments: voz's own "Đính kèm tệp" button opens a file picker for any accepted type and the
    // files join the post through `attachment_key`. Paste/drop stay on pik.vn (see uploadAndInsert).
    let attachContext = null;
    try { attachContext = editor.dataset.attachContext ? JSON.parse(editor.dataset.attachContext) : null; } catch { attachContext = null; }
    const uploads = attachContext && attachmentSupported() ? new AttachmentUploads(attachContext) : null;
    editor._uploads = uploads;
    const renderUploadList = () => {
      if (!uploads) return;
      let strip = editor.querySelector('.attach-strip');
      if (!uploads.items.length) { strip?.remove(); return; }
      if (!strip) {
        strip = document.createElement('ul');
        strip.className = 'attach-strip';
        editor.insertBefore(strip, status);
      }
      strip.innerHTML = uploads.items
        .map(
          (item) => `<li class="attach-row is-${item.status}">
            ${item.status === 'done' ? `<img class="attach-thumb" src="${esc(item.attachment.thumbnail_url || item.attachment.direct_url || item.attachment.url || '')}" alt="">` : ''}
            <span class="attach-name">${esc(item.name)}</span>
            <span class="attach-state">${item.status === 'uploading' ? 'Đang tải…' : item.status === 'error' ? esc(item.error || 'Lỗi') : `<button type="button" data-attach-remove title="Gỡ tệp đính kèm">&times;</button>`}</span>
          </li>`
        )
        .join('');
    };
    editor.addEventListener('attach:changed', renderUploadList);
    const notifyAttach = () => editor.dispatchEvent(new CustomEvent('attach:changed'));
    editor.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-attach-remove]');
      if (!btn || !uploads) return;
      const row = btn.closest('.attach-row');
      const index = row ? [...row.parentElement.children].indexOf(row) : -1;
      const item = uploads.items[index];
      if (item) uploads.remove(item).then(renderUploadList);
    });

    // The attach button lives in the form's button row (views/thread.js) so it sits next to the submit button;
    // its hidden any-file input is injected once per editor.
    const attachInput = document.createElement('input');
    attachInput.type = 'file';
    attachInput.multiple = true;
    attachInput.hidden = true;
    attachInput.accept = ATTACH_ACCEPT;
    attachInput.addEventListener('change', () => {
      attachFiles([...attachInput.files]);
      attachInput.value = '';
    });
    editor.append(attachInput);
    const attachButton = editor.closest('form')?.querySelector('.editor-attach-button') || null;
    attachButton?.addEventListener('click', () => {
      if (!uploads) {
        status.textContent = 'Đăng nhập lại để cấp quyền đính kèm tệp (attachment:write).';
        return;
      }
      attachInput.click();
    });

    const attachFiles = async (files) => {
      if (!uploads || !files.length) return;
      status.textContent = files.length > 1 ? `Đang tải ${files.length} tệp đính kèm…` : 'Đang tải tệp đính kèm…';
      try {
        await uploads.add(files, notifyAttach);
        const done = uploads.done.filter((item) => !item.inserted);
        for (const item of done) item.inserted = true;
        if (done.length) insert(done.map((item) => uploads.attachBbcode(item)).join('\n'));
        const failed = uploads.items.filter((item) => item.status === 'error');
        status.textContent = failed.length
          ? `Không tải được: ${failed.map((item) => item.error).join('; ')}`
          : `Đã đính kèm ${uploads.done.length} tệp.`;
      } catch (error) {
        status.textContent = error.message || 'Tải tệp lên thất bại.';
      }
    };
    // Paste, drop and the image panel always host on pik.vn and insert [IMG]; the native attachment API is a
    // separate button (xem attach::*) for arbitrary files. The status line reports progress because it is a
    // network round trip.
    const pendingUploads = new Set();
    const uploadAndInsert = async (files) => {
      if (!files?.length) return;
      if (sourceMode) status.textContent = 'Chuyển về chế độ soạn thảo để tải ảnh lên.';
      const token = Symbol('upload');
      pendingUploads.add(token);
      status.textContent = files.length > 1 ? `Đang tải ${files.length} ảnh lên pik.vn…` : 'Đang tải ảnh lên pik.vn…';
      try {
        const { results, skipped } = await uploadImageFiles(files, (done, total) => {
          if (total > 1) status.textContent = `Đang tải ảnh lên pik.vn… ${done}/${total}`;
        });
        if (!editor.isConnected) return;
        const ok = results.filter((result) => result.ok && result.url);
        if (ok.length) insert(ok.map((result) => pikBbcode(result.url)).join('\n'));
        const failed = results.filter((result) => !result.ok);
        if (failed.length) status.textContent = `Không tải được: ${failed.map((result) => result.error).join('; ')}`;
        else if (skipped) status.textContent = `${skipped} tệp không phải ảnh đã bỏ qua.`;
        else status.textContent = `Đã chèn ${ok.length} ảnh.`;
      } catch (error) {
        status.textContent = error.message || 'Tải ảnh lên thất bại.';
      } finally {
        pendingUploads.delete(token);
      }
    };
    const clipboardImages = (data) => {
      const files = [];
      for (const item of data?.items || []) {
        if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
        const file = item.getAsFile();
        if (file) files.push(file);
      }
      return files;
    };
    visual.addEventListener('paste', (event) => {
      const images = clipboardImages(event.clipboardData);
      if (images.length) {
        event.preventDefault();
        rememberSelection();
        uploadAndInsert(images);
        return;
      }
      event.preventDefault();
      rememberSelection();
      insert(event.clipboardData.getData('text/plain'), true);
    });
    // Also catch image pastes while the visual editor is not focused.
    editor.addEventListener('paste', (event) => {
      if (event.defaultPrevented) return;
      const images = clipboardImages(event.clipboardData);
      if (!images.length) return;
      event.preventDefault();
      rememberSelection();
      uploadAndInsert(images);
    });
    visual.addEventListener('dragover', (event) => {
      if ([...(event.dataTransfer?.items || [])].some((item) => item.kind === 'file' && item.type.startsWith('image/'))) event.preventDefault();
    });
    visual.addEventListener('drop', (event) => {
      event.preventDefault();
      const files = [...(event.dataTransfer?.files || [])].filter((file) => file.type.startsWith('image/'));
      if (files.length) { rememberSelection(); uploadAndInsert(files); return; }
      status.textContent = 'Chỉ hỗ trợ kéo thả tệp ảnh. Dùng nút Tải ảnh lên để chọn hoặc dán ảnh.';
    });
    visual.addEventListener('click', (event) => { if (event.target.closest('a')) event.preventDefault(); });
    editor.addEventListener('change', (event) => {
      const option = event.target.dataset.option; if (!option || !event.target.value) return;
      const val = event.target.value;
      if (option === 'align') wrap(val);
      else if (option === 'paragraph') wrap('SIZE', val === 'large' ? '=6' : '=4');
      else wrap(option, `=${val}`);
      closeMenus();
      if (event.target.tagName === 'SELECT') event.target.value = '';
    });
    editor.addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-menu]');
      if (toggle) {
        const menu = editor.querySelector(`[data-menu-panel="${toggle.dataset.menu}"]`);
        const opening = menu.hidden;
        closeMenus(); closePanel();
        if (opening) openMenu(toggle, menu);
        toggle.setAttribute('aria-expanded', String(opening));
        toggle.classList.toggle('is-open', opening);
        return;
      }
      const button = event.target.closest('[data-tool]'); if (!button) return;
      closeMenus();
      const tool = button.dataset.tool;
      if (tool === 'mode') {
        sourceMode = !sourceMode; textarea.hidden = !sourceMode; visual.hidden = sourceMode;
        button.setAttribute('aria-pressed', String(sourceMode)); closePanel();
        if (sourceMode) { nativeFocus(); sourceSelection = [textarea.selectionStart, textarea.selectionEnd]; } else { render(); savedRange = null; visual.focus(); }
      } else if (tool === 'preview') { preview.hidden = !preview.hidden; button.setAttribute('aria-expanded', String(!preview.hidden)); refreshPreview(); }
      else if (tool === 'undo' || tool === 'redo') undo(tool === 'undo' ? -1 : 1);
      else if (tool === 'restore') { if (stored?.value) set(stored.value); }
      else if (tool === 'discard') { try { localStorage.removeItem(draftKey); stored = null; restoreButton.disabled = true; status.textContent = 'Đã xoá nháp; nội dung đang soạn vẫn còn. Lần sửa tiếp theo sẽ lưu nháp mới.'; } catch { status.textContent = 'Không thể xoá nháp.'; } }
      else if (['bold', 'italic', 'underline', 'strikeThrough'].includes(tool)) {
        if (sourceMode) wrap({ bold: 'B', italic: 'I', underline: 'U', strikeThrough: 'S' }[tool]);
        else { range(); document.execCommand(tool); native.set.call(textarea, editorDomCode(visual)); rememberSelection(); record(); }
      } else if (tool === 'list' || tool === 'ordered') {
        if (sourceMode) insert(`[LIST${tool === 'ordered' ? '=1' : ''}]\n${(selected() || '…').split('\n').map((line) => `[*]${line}`).join('\n')}\n[/LIST]`);
        else { range(); document.execCommand(tool === 'ordered' ? 'insertOrderedList' : 'insertUnorderedList'); native.set.call(textarea, editorDomCode(visual)); rememberSelection(); record(); }
      } else if (tool === 'hr') insert('[HR]\n');
      else if (tool === 'size') wrap('SIZE', '=6');
      else if (tool === 'icode') wrap('ICODE');
      else if (tool === 'ispoiler') wrap('ISPOILER');
      else if (tool === 'code') insert(`[CODE]${selected(true) || '…'}[/CODE]\n`);
      else if (tool === 'clear') {
        if (sourceMode) insert(editorCodePlain(selected()), true);
        else {
          range(); document.execCommand('removeFormat'); document.execCommand('unlink');
          for (const node of visual.querySelectorAll('[data-bb-tag="color"], [data-bb-tag="size"], [data-bb-tag="font"]')) {
            const property = { color: 'color', size: 'fontSize', font: 'fontFamily' }[node.dataset.bbTag];
            if (!node.style[property]) { delete node.dataset.bbTag; delete node.dataset.bbAttrs; }
          }
          native.set.call(textarea, editorDomCode(visual)); rememberSelection(); record();
        }
      } else if (!panel.hidden && panel.dataset.panelKind === tool) closePanel();
      else {
        for (const other of editor.querySelectorAll('[data-tool][aria-expanded="true"]')) other.setAttribute('aria-expanded', 'false');
        if (panelTools.includes(tool)) button.setAttribute('aria-expanded', 'true');
        showToolPanel(panel, tool, insert, selected(true));
      }
    });
    textarea.addEventListener('editor:clear-draft', () => { try { localStorage.removeItem(draftKey); stored = null; restoreButton.disabled = true; status.textContent = 'Đã gửi · Đã xoá nháp.'; } catch { /* No storage available. */ } });
    // Quote/reply inserts at the top; the caret belongs at the end so the reader can type. The visual editor
    // owns the caret, so it is placed there.
    textarea.addEventListener('editor:focus-end', () => {
      if (sourceMode) {
        nativeFocus();
        const end = value().length;
        textarea.setSelectionRange(end, end);
        sourceSelection = [end, end];
        return;
      }
      visual.focus();
      const target = document.createRange();
      target.selectNodeContents(visual);
      target.collapse(false);
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(target);
      savedRange = target.cloneRange();
    });
    render(); textarea.hidden = true; visual.hidden = false;
    editor.querySelector('[data-tool="undo"]').disabled = true;
    editor.querySelector('[data-tool="redo"]').disabled = true;
  }
}
