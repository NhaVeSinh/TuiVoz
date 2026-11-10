// The textarea remains the canonical, synchronous BBCode interface for every view.
import { esc } from '../core/utils.js';
import { state } from '../core/dom.js';
import { editorCodeHtml, editorDomCode, editorCodePlain } from '../lib/editorCodec.js';
import { loadSmilies, smiliesReady, renderSmilies } from '../lib/smilies.js';
import { editorToolbar, showToolPanel, panelTools } from './editorTools.js';
import { uploadImageFiles, pikBbcode } from '../lib/pikUpload.js';

export function editorHtml(id, value = '', placeholder = 'Nội dung…') {
  return `<div class="rich-editor" data-editor-id="${esc(id)}">
    ${editorToolbar(id)}
    <div class="editor-panel" hidden></div>
    <textarea class="textarea editor-source" id="${esc(id)}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}">${esc(value)}</textarea>
    <div class="editor-visual" role="textbox" aria-multiline="true" aria-label="${esc(placeholder)}" data-placeholder="${esc(placeholder)}" contenteditable="true" hidden></div>
    <div class="editor-preview bbWrapper" aria-label="Xem trước cục bộ" hidden></div>
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
    const undo = (direction) => {
      const next = position + direction;
      if (next < 0 || next >= history.length) return;
      position = next; set(history[position], false);
      editor.querySelector('[data-tool="undo"]').disabled = position === 0;
      editor.querySelector('[data-tool="redo"]').disabled = position === history.length - 1;
    };
    const closeMenus = () => {
      for (const menu of editor.querySelectorAll('[data-menu-panel]')) menu.hidden = true;
      for (const toggle of editor.querySelectorAll('[data-menu]')) toggle.setAttribute('aria-expanded', 'false');
    };
    const closePanel = () => {
      panel.hidden = true; panel.replaceChildren(); delete panel.dataset.panelKind;
      for (const tool of editor.querySelectorAll('[data-tool][aria-expanded="true"]')) tool.setAttribute('aria-expanded', 'false');
    };
    panel.addEventListener('editor:panel-close', closePanel);
    const outsidePointer = (event) => {
      if (!editor.isConnected) { document.removeEventListener('pointerdown', outsidePointer); return; }
      if (event.target.closest('.editor-toolbar, .editor-panel')?.closest('.rich-editor') === editor) return;
      closeMenus(); closePanel();
    };
    document.addEventListener('pointerdown', outsidePointer);
    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        const toggle = editor.querySelector('[data-menu][aria-expanded="true"]');
        closeMenus(); closePanel(); toggle?.focus();
      }
    });
    editor.addEventListener('pointerdown', (event) => { if (event.target.closest('.editor-toolbar')) { rememberSelection(); if (event.target.closest('button')) event.preventDefault(); } });
    for (const surface of [visual, textarea]) {
      surface.addEventListener('keyup', rememberSelection); surface.addEventListener('mouseup', rememberSelection); surface.addEventListener('blur', rememberSelection);
      surface.addEventListener('input', () => {
        if (composing) return;
        if (surface === visual) native.set.call(textarea, editorDomCode(visual)); else render();
        rememberSelection(); record();
        // Typing a smilie code shows the image immediately.
        if (surface === visual) liveSmilies();
      });
      surface.addEventListener('compositionstart', () => { composing = true; });
      surface.addEventListener('compositionend', () => { composing = false; surface.dispatchEvent(new Event('input', { bubbles: true })); });
      surface.addEventListener('beforeinput', (event) => { if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') { event.preventDefault(); undo(event.inputType === 'historyUndo' ? -1 : 1); } });
      surface.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) { event.preventDefault(); undo(event.key.toLowerCase() === 'y' || event.shiftKey ? 1 : -1); }
        if ((event.ctrlKey || event.metaKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase()) && !sourceMode) {
          event.preventDefault(); rememberSelection(); document.execCommand({ b: 'bold', i: 'italic', u: 'underline' }[event.key.toLowerCase()]); native.set.call(textarea, editorDomCode(visual)); record();
        }
      });
    }
    // Clipboard and dropped images upload to pik.vn and insert as [IMG]; the panel reports progress because it
    // is a network round trip.
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
        const opening = menu.hidden; closeMenus(); closePanel();
        menu.hidden = !opening; toggle.setAttribute('aria-expanded', String(opening));
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
