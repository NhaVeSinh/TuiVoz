// In-place post editing, like voz.vn: the body is swapped for an editor inside the same post container. Saving
// restores the body without a reload; cancelling puts the original back.
//
// `ctx` switches the endpoint family: { kind: 'post', thread, page } (default) or
// { kind: 'conversation', conversation, page }.

import { esc, timeAgo, fullDate, postDate } from '../core/utils.js';
import { threadPath, dmPath, withPage } from '../core/paths.js';
import { api } from '../api.js';
import { sanitizeHtml } from '../lib/bbcode.js';
import { registerAttachments } from '../lib/attachments.js';
import { editorHtml, wireEditor, clearEditorDraft } from './editor.js';
import { toast } from './feedback.js';
import { suppressChromeAutoHide } from './chromeAutoHide.js';

let active = null;

function attributionHtml(post, href) {
  const edited = post.last_edit_date ? `<span class="u-dimmed">· Đã sửa ${timeAgo(post.last_edit_date, 'thread')}</span>` : '';
  return `<li><a href="${href}"><time data-post-time title="${esc(fullDate(post.post_date || post.message_date))}">${postDate(post.post_date || post.message_date, 'thread')}</time></a></li>${edited ? `<li>${edited}</li>` : ''}`;
}

function postHref(post, { kind = 'post', thread, conversation, page } = {}) {
  if (kind === 'conversation') return `${withPage(dmPath(conversation), page)}#conversation-message-${post.message_id}`;
  return `${withPage(threadPath(thread), page)}#post-${post.post_id}`;
}

export function cancelInlineEdit() {
  if (!active) return;
  const { cell, main, form } = active;
  active = null;
  form.remove();
  main.hidden = false;
  cell.classList.remove('is-editing');
}

// False when the post has no editable markup (e.g. it was re-rendered).
export function openInlineEdit(post, thread, page) {
  return openInlineEditWith(post, { kind: 'post', thread, page });
}

export function openInlineEditWith(post, ctx) {
  const { kind = 'post', thread, conversation, page } = ctx || {};
  cancelInlineEdit();
  const anchorId = kind === 'conversation' ? `conversation-message-${post.message_id}` : `post-${post.post_id}`;
  const draftId = kind === 'conversation' ? `edit-conversation-message-${post.message_id}` : `edit-post-${post.post_id}`;
  const article = document.getElementById(anchorId);
  const cell = article?.querySelector('.message-cell--main');
  const main = cell?.querySelector('.message-main');
  if (!cell || !main) return false;

  // Make sure this post's attachments resolve even if rendered elsewhere.
  registerAttachments(post);

  const form = document.createElement('form');
  form.className = 'inline-edit';
  form.id = `inline-edit-${anchorId}`;
  form.noValidate = true;
  form.innerHTML = `
    <div class="inline-edit-body">${editorHtml(`inline-edit-message-${anchorId}`, post.message || '', 'Nội dung bài viết…')}</div>
    <div class="inline-edit-actions">
      <button class="button button--primary" type="submit">Lưu</button>
      <button class="button" type="button" data-cancel>Huỷ</button>
    </div>`;
  form.querySelector('.rich-editor').dataset.draftContext = draftId;
  main.hidden = true;
  cell.classList.add('is-editing');
  cell.append(form);
  wireEditor(form);
  active = { cell, main, form, post };

  const textarea = form.querySelector('textarea');
  form.querySelector('[data-cancel]').addEventListener('click', cancelInlineEdit);
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      cancelInlineEdit();
    }
  });
  textarea.focus();
  // Revealing the editor can tuck the form under the sticky bars; tell the auto-hide watcher this scroll is
  // ours.
  suppressChromeAutoHide();
  form.scrollIntoView({ block: 'nearest' });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = textarea.value.trim();
    if (!message) return toast('Nội dung trống', true);
    if (message === (post.message || '').trim()) return cancelInlineEdit();
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    submit.textContent = 'Đang lưu…';
    try {
      const res = kind === 'conversation'
        ? await api.editConversationMessage(post.message_id, message)
        : await api.editPost(post.post_id, message);
      const updated = (res.post || res.message) || {};
      post.message = updated.message ?? message;
      post.message_parsed = updated.message_parsed ?? post.message_parsed;
      post.last_edit_date = updated.last_edit_date ?? Math.floor(Date.now() / 1000);
      clearEditorDraft(textarea);
      cancelInlineEdit();
      renderEditResult(post, article, ctx || {});
      toast('Đã lưu');
    } catch (err) {
      toast(err.message || 'Lưu thất bại', true);
      submit.disabled = false;
      submit.textContent = 'Lưu';
    }
  });
  return true;
}

// Only the body and the attribution line change; the rest of the post stays as it is.
function renderEditResult(post, article, ctx) {
  const body = article.querySelector('.message-userContent');
  if (body) body.innerHTML = `<article class="message-body bbWrapper">${sanitizeHtml(post.message_parsed || esc(post.message), post.message)}</article>`;
  const attrMain = article.querySelector('.message-attribution-main');
  if (attrMain) attrMain.innerHTML = attributionHtml(post, postHref(post, ctx));
}
