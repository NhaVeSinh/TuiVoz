/** New thread view. */
import { app } from '../core/dom.js';
import { esc } from '../core/utils.js';
import { forumPath, threadPath } from '../core/paths.js';
import { navigate } from '../core/nav.js';
import { api } from '../api.js';
import { setBreadcrumbs } from '../ui/chrome.js';
import { setTitle } from '../ui/title.js';
import { requireLogin } from '../ui/session.js';
import { editorHtml, wireEditor, clearEditorDraft } from '../ui/editor.js';
import { loading, errorBox, toast } from '../ui/feedback.js';

export async function viewCompose(nodeId) {
  if (!requireLogin()) return;
  setTitle('Post thread');
  loading();
  try {
    const { forum } = await api.forum(nodeId);
    setBreadcrumbs([{ label: 'Diễn đàn', href: '/' }, { label: forum.title, href: forumPath(forum) }, { label: 'Tạo chủ đề mới' }]);
    const data = forum.type_data || {};
    if (data.can_create_thread === false || forum.can_create_thread === false) {
      app.innerHTML = '<div class="empty">Bạn không có quyền tạo chủ đề trong diễn đàn này.</div>';
      return;
    }
    const prefixes = (data.prefixes || []).filter((prefix) => prefix.is_usable !== false);
    if ((data.require_prefix && !prefixes.length) || data.min_tags > 0 || (data.custom_fields || []).length) {
      app.innerHTML = `<div class="block block-body--pad">Diễn đàn này yêu cầu thêm thông tin đặc biệt. <a href="https://voz.vn${forumPath(forum)}post-thread" target="_blank" rel="noopener">Tạo chủ đề trên voz.vn</a></div>`;
      return;
    }
    app.innerHTML = `<section class="block"><h1 class="block-header">Tạo chủ đề mới — ${esc(forum.title)}</h1><form id="compose-thread" class="block-body--pad">${prefixes.length ? `<div class="formRow"><label for="thread-prefix">Tiền tố</label><select class="input" id="thread-prefix" ${data.require_prefix ? 'required' : ''}><option value="">Chọn tiền tố</option>${prefixes.map((prefix) => `<option value="${prefix.prefix_id}">${esc(prefix.title)}</option>`).join('')}</select></div>` : ''}<div class="formRow"><label for="thread-title">Tiêu đề</label><input class="input" id="thread-title" required maxlength="150"></div><div class="formRow"><label for="thread-message">Nội dung</label>${editorHtml('thread-message', '', 'Nội dung…', { node_id: nodeId })}</div><p class="formHint">Chủ đề sẽ được đăng công khai trên voz.vn khi bạn nhấn nút bên dưới.</p><button class="button button--cta" type="submit">Đăng chủ đề</button><p role="alert" id="compose-error"></p></form></section>`;
    wireEditor(app);
    const form = document.getElementById('compose-thread');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const title = document.getElementById('thread-title').value.trim();
      const message = document.getElementById('thread-message').value.trim();
      if (!title || !message) return toast('Nhập đủ tiêu đề và nội dung', true);
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        const prefixId = Number(document.getElementById('thread-prefix')?.value) || undefined;
        const uploads = form.querySelector('.rich-editor')?._uploads;
        const attachmentKey = uploads ? await uploads.attachmentKeyOrNull().catch(() => null) : null;
        const res = await api.createThread(nodeId, title, message, prefixId, attachmentKey || undefined);
        clearEditorDraft(document.getElementById('thread-message'));
        navigate(threadPath(res.thread));
      } catch (err) {
        document.getElementById('compose-error').textContent = err.message;
        button.disabled = false;
      }
    });
  } catch (err) {
    app.innerHTML = errorBox(err);
  }
}
