// Direct messages: list, conversation, compose.

import { app } from '../core/dom.js';
import { esc, num, timeAgo } from '../core/utils.js';
import { dmPath, userPath, withPage } from '../core/paths.js';
import { navigate } from '../core/nav.js';
import { api } from '../api.js';
import { setActiveNav, setBreadcrumbs } from '../ui/chrome.js';
import { setTitle } from '../ui/title.js';
import { loading, errorBox, toast } from '../ui/feedback.js';
import { pagination, wirePageJump } from '../ui/pagination.js';
import { requireLogin } from '../ui/session.js';
import { editorHtml, wireEditor, clearEditorDraft } from '../ui/editor.js';
import { avatarMarkup } from '../lib/avatar.js';
import { stripQuotes } from '../lib/bbcode.js';
import { registerAttachments } from '../lib/attachments.js';
import { postHtml } from '../ui/post.js';
import { openInlineEditWith } from '../ui/inlineEdit.js';
import { wireMemberTooltips } from '../ui/memberTooltip.js';

// Every conversation click handler attached to `#app`. The router never removes them, and a re-render keeps the
// same `#app`, so stale handlers would resolve an old message map. The thread view tracks its own the same way.
const conversationClickHandlers = [];

function removeConversationClickHandlers() {
  for (const handler of conversationClickHandlers) app.removeEventListener('click', handler);
  conversationClickHandlers.length = 0;
}

export async function viewDmList(page) {
  setActiveNav('dm');
  setBreadcrumbs([{ label: 'Diễn đàn', href: '/' }, { label: 'Hộp thư' }]);
  setTitle('Direct messages', page);
  if (!requireLogin()) return;
  loading();
  try {
    const res = await api.conversations(page);
    const list = res.conversations || [];
    app.innerHTML = `
      <div class="block">
        <div class="block-header">
          Hộp thư
          <span class="block-header-extra"><a href="/direct-messages/new">+ Tin nhắn mới</a></span>
        </div>
        ${
          list.length
            ? `<ul class="dm-list">${list
                .map((c) => {
                  const others = Object.entries(c.recipients || {})
                    .filter(([id]) => String(id) !== String(c.user_id))
                    .map(([, name]) => name);
                  const who = others.length ? others.join(', ') : c.username;
                  return `<li class="dm-row${c.is_unread ? ' is-unread' : ''}">
                    <a href="${dmPath(c)}" class="avatar">${avatarMarkup(c.Starter, 's')}</a>
                    <div class="dm-main">
                      <a class="dm-title" href="${dmPath(c)}">${esc(c.title)}</a>
                      <div class="dm-meta">${esc(who)} · ${timeAgo(c.last_message_date)} · ${num(c.reply_count)} trả lời</div>
                    </div>
                  </li>`;
                })
                .join('')}</ul>`
            : '<div class="empty">Chưa có cuộc trò chuyện nào.</div>'
        }
        ${pagination(res.pagination, (p) => withPage('/direct-messages', p))}
      </div>`;
    wirePageJump((p) => withPage('/direct-messages', p));
  } catch (err) {
    app.innerHTML = errorBox(err);
  }
}

export async function viewDm(conversationId, page) {
  setActiveNav('dm');
  if (!requireLogin()) return;
  loading();
  try {
    const res = await api.conversation(conversationId, page);
    const conv = res.conversation;
    const messages = res.messages || [];
    const currentPage = res.pagination ? res.pagination.current_page : 1;
    setBreadcrumbs([
      { label: 'Diễn đàn', href: '/' },
      { label: 'Hộp thư', href: '/direct-messages' },
      { label: conv.title },
    ]);
    setTitle(conv.title, currentPage);
    // A conversation by nature has two sides; opening it clears its unread state like a thread does.
    if (conv.is_unread && conv.last_message_date) {
      api.markConversationRead(conv.conversation_id, conv.last_message_date).catch(() => {});
    }
    app.innerHTML = `
      <div class="block block--messages block--conversation">
        <div class="block-header">
          <span class="block-header-title" id="conversation-title">${esc(conv.title)}</span>
          <span class="block-header-extra">${num(conv.reply_count, 'thread')} trả lời</span>
        </div>
        <div class="block-outer">
          <div class="block-outer-main">
            ${pagination(res.pagination, (p) => withPage(dmPath(conv), p), '', { scrollArm: false })}
          </div>
        </div>
        <div class="block-body" id="message-list">
          ${messages.map((m) => postHtml(m, conv, currentPage, 'conversation')).join('')}
        </div>
        <div class="block-outer block-outer--bottom">
          <div class="block-outer-main">${pagination(res.pagination, (p) => withPage(dmPath(conv), p))}</div>
        </div>
      </div>
      <div class="block" id="dm-reply-block">
        <div class="block-header">Trả lời</div>
        <div class="block-body block-body--pad">
          ${
            conv.can_reply === false
              ? '<p class="u-dimmed">Bạn không thể trả lời hội thoại này.</p>'
              : `<form id="dm-reply-form">
                   ${editorHtml('dm-reply', '', 'Nội dung tin nhắn…')}
                   <div class="reply-submit-row"><button class="button button--primary" type="submit">Gửi</button></div>
                 </form>`
          }
        </div>
      </div>`;
    wireEditor(app);
    // Each message may carry [ATTACH] ids; only this conversation's list is registered.
    registerAttachments(messages);
    wireMemberTooltips(app, messages.map((m) => m.User));
    wireSignatureToggles(app);
    wireMessageActions(conv, messages, currentPage);
    wirePageJump((p) => withPage(dmPath(conv), p));
    const form = document.getElementById('dm-reply-form');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = document.getElementById('dm-reply').value.trim();
      if (!message) return toast('Nội dung trống', true);
      const submit = form.querySelector('button[type=submit]');
      submit.disabled = true;
      submit.textContent = 'Đang gửi…';
      try {
        await api.replyConversation(conversationId, message);
        clearEditorDraft(document.getElementById('dm-reply'));
        toast('Đã gửi');
        await viewDm(conversationId, 'last');
      } catch (err) {
        toast(err.message || 'Gửi thất bại', true);
        submit.disabled = false;
        submit.textContent = 'Gửi';
      }
    });
  } catch (err) {
    app.innerHTML = errorBox(err);
  }
}

function wireSignatureToggles(root) {
  for (const signature of root.querySelectorAll('.message-signature')) {
    const button = signature.nextElementSibling;
    if (!button?.matches('.signature-toggle') || signature.dataset.toggleReady) continue;
    signature.dataset.toggleReady = 'true';
    if (signature.scrollHeight > signature.clientHeight + 1) button.hidden = false;
  }
  if (root !== app || root.dataset.signatureTogglesWired) return;
  root.dataset.signatureTogglesWired = 'true';
  root.addEventListener('click', (event) => {
    const button = event.target.closest('.signature-toggle');
    if (!button) return;
    const signature = button.previousElementSibling;
    const expanded = signature.classList.toggle('is-expanded');
    signature.classList.toggle('is-collapsed', !expanded);
    button.textContent = expanded ? 'Thu gọn' : 'Xem thêm';
    button.setAttribute('aria-expanded', String(expanded));
  });
}

// Reply/quote are the same two-step as the thread view: fill the box, then either stay (Trích dẫn) or go to the
// box (Trả lời). Conversation messages are quoted with their own BBCode, not a thread post reference.
function insertMessageQuote(message) {
  const textarea = document.getElementById('dm-reply');
  if (!textarea) return false;
  const body = stripQuotes(message.message || '');
  const quote = `[QUOTE="${String(message.username || '').replace(/"/g, '')}"]\n${body}\n[/QUOTE]`;
  const value = textarea.value;
  const base = value.replace(/\n+$/, '');
  textarea.value = base ? `${base}${quote}\n` : `${quote}\n`;
  return true;
}

function wireMessageActions(conv, messages, page) {
  const byId = new Map(messages.map((m) => [Number(m.message_id), m]));
  removeConversationClickHandlers();
  const onClick = async (event) => {
    const postTime = event.target.closest('[data-post-time]');
    if (postTime && matchMedia('(max-width: 620px)').matches) {
      event.preventDefault();
      event.stopPropagation();
      postTime.textContent = postTime.title;
      return;
    }

    const quoteLink = event.target.closest('[data-quote]');
    if (quoteLink) {
      event.preventDefault();
      const message = byId.get(Number(quoteLink.dataset.quote));
      if (!message) return;
      if (!insertMessageQuote(message)) return;
      toast('Đã trích dẫn vào khung trả lời');
      return;
    }

    const replyLink = event.target.closest('[data-reply]');
    if (replyLink) {
      event.preventDefault();
      const message = byId.get(Number(replyLink.dataset.reply));
      if (!message) return;
      if (!insertMessageQuote(message)) return;
      const block = document.getElementById('dm-reply-block');
      block?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const textarea = document.getElementById('dm-reply');
      if (textarea) {
        textarea.focus();
        textarea.dispatchEvent(new Event('editor:focus-end'));
      }
      return;
    }

    const editLink = event.target.closest('[data-edit]');
    if (editLink) {
      event.preventDefault();
      const message = byId.get(Number(editLink.dataset.edit));
      if (message) openInlineEditWith(message, { kind: 'conversation', conversation: conv, page });
    }
  };
  conversationClickHandlers.push(onClick);
  app.addEventListener('click', onClick);
}

export async function viewNewDm(prefillUser) {
  setActiveNav('dm');
  if (!requireLogin()) return;
  setBreadcrumbs([
    { label: 'Diễn đàn', href: '/' },
    { label: 'Hộp thư', href: '/direct-messages' },
    { label: 'Tin nhắn mới' },
  ]);
  setTitle('Send direct message');
  app.innerHTML = `
    <div class="block">
      <div class="block-header">Tin nhắn mới</div>
      <div class="block-body block-body--pad">
        <form id="new-dm-form">
          <div class="formRow">
            <label for="dm-recipient">Người nhận (tên tài khoản)</label>
            <input class="input" id="dm-recipient" value="${esc(prefillUser || '')}" placeholder="username">
            <div class="formHint" id="dm-recipient-hint"></div>
          </div>
          <div class="formRow">
            <label for="dm-title">Tiêu đề</label>
            <input class="input" id="dm-title" placeholder="Tiêu đề">
          </div>
          <div class="formRow">
            <label for="dm-message">Nội dung</label>
            ${editorHtml('dm-message', '', 'Nội dung tin nhắn…')}
          </div>
          <button class="button button--primary" type="submit">Gửi</button>
        </form>
      </div>
    </div>`;

  wireEditor(app);
  const recipientInput = document.getElementById('dm-recipient');
  const hint = document.getElementById('dm-recipient-hint');
  let resolvedId = null;
  let timer = null;

  const resolve = async () => {
    const username = recipientInput.value.trim();
    resolvedId = null;
    if (!username) {
      hint.textContent = '';
      return;
    }
    hint.textContent = 'Đang tìm…';
    try {
      const res = await api.findUser(username);
      const exact = res.exact || res.users?.[0];
      if (exact && exact.user_id) {
        resolvedId = exact.user_id;
        hint.innerHTML = `Đã tìm thấy <a href="${userPath(exact)}">${esc(exact.username)}</a> (#${exact.user_id})`;
      } else {
        hint.textContent = 'Không tìm thấy tài khoản này.';
      }
    } catch {
      hint.textContent = 'Không tìm thấy tài khoản này.';
    }
  };

  recipientInput.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(resolve, 500);
  });
  if (prefillUser) resolve();

  document.getElementById('new-dm-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!resolvedId) return toast('Chưa xác định người nhận', true);
    const title = document.getElementById('dm-title').value.trim();
    const message = document.getElementById('dm-message').value.trim();
    if (!title || !message) return toast('Nhập đủ tiêu đề và nội dung', true);
    try {
      const res = await api.createConversation([resolvedId], title, message);
      clearEditorDraft(document.getElementById('dm-message'));
      toast('Đã gửi tin nhắn');
      navigate(dmPath(res.conversation));
    } catch (err) {
      toast(err.message || 'Gửi thất bại', true);
    }
  });
}
