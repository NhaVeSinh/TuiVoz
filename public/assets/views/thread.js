/** Thread view. */

import { app, state } from '../core/dom.js';
import { esc, num } from '../core/utils.js';
import { threadPath, forumPath, userPath, withPage } from '../core/paths.js';
import { currentPage, navigate, keepCurrentScroll } from '../core/nav.js';
import { ICON_EYE_ON, ICON_EYE_OFF, ICON_USER, ICON_REPLY, ICON_ATTACH } from '../core/icons.js';
import { avatarMarkup } from '../lib/avatar.js';
import { api, ApiError } from '../api.js';
import { setActiveNav, setBreadcrumbs } from '../ui/chrome.js';
import { setThreadTitle } from '../ui/title.js';
import { loading, errorBox, toast } from '../ui/feedback.js';
import { pagination, wirePageJump, wireScrollArm } from '../ui/pagination.js';
import { postEntriesHtml } from '../filters/apply.js';
import { wireThreadRowBans } from '../ui/threadRow.js';
import { hydrateReactionLists, reactionBar, reactionSummary, invalidateReactionUsers } from '../ui/reactions.js';
import { editorHtml, wireEditor, clearEditorDraft } from '../ui/editor.js';
import { registerAttachments, clearAttachments } from '../lib/attachments.js';
import { openInlineEdit } from '../ui/inlineEdit.js';
import { openReportModal } from '../ui/modal.js';
import { prefixLabel } from '../lib/prefix.js';
import { quoteBlock } from '../lib/bbcode.js';
import { loadSmilies } from '../lib/smilies.js';
import { wireMemberTooltips } from '../ui/memberTooltip.js';
import { wireTitleHold } from '../ui/titleHold.js';
import { mountInfiniteScroll } from '../ui/infiniteScroll.js';
import { openPostNumberPopup } from '../ui/postNumberPopup.js';
import { jumpToAnchor } from '../lib/jumpToAnchor.js';
import { signalOpen, signalRead } from '../lib/signals.js';
import { moderationButtonHtml, moderationMenuHtml, wireModeration, openWarnModal } from '../ui/threadModeration.js';
import { cachedCatalog } from '../lib/catalogs.js';

// On-screen posts so delegated clicks resolve posts from appended pages.
const postIndex = new Map();

// Tracked #app click handlers so concurrent re-renders can't orphan listeners.
const threadClickHandlers = [];

function removeThreadClickHandlers() {
  for (const handler of threadClickHandlers) app.removeEventListener('click', handler);
  threadClickHandlers.length = 0;
  app._threadHandler = null;
}

// Assigning .value re-renders the contenteditable .editor-visual too.
function insertQuote(post) {
  const textarea = document.getElementById('reply-message');
  if (!textarea) return false;
  const value = textarea.value;
  // Trailing newline marks where the next quote appends.
  const base = value.replace(/\n+$/, '');
  textarea.value = base ? `${base}${quoteBlock(post)}\n` : `${quoteBlock(post)}\n`;
  return true;
}

// Caret goes after the inserted quote.
function focusReplyEnd() {
  const textarea = document.getElementById('reply-message');
  if (!textarea) return;
  textarea.focus();
  textarea.dispatchEvent(new Event('editor:focus-end'));
}

// Quick reply shows reader avatar + arrow column like voz.vn.
function quickReplyUserHtml() {
  const me = state.me;
  const avatar = `<a ${me ? `href="${userPath(me)}" data-member-id="${Number(me.user_id)}"` : ''} class="avatar avatar--m" aria-label="${esc(me?.username || 'Khách')}">${avatarMarkup(me, 'm')}</a>`;
  return `<div class="message-cell message-cell--user">
                          <div class="message-user">
                            <div class="message-avatar">
                              <div class="message-avatar-wrapper">${avatar}</div>
                            </div>
                            <span class="message-userArrow"></span>
                          </div>
                        </div>`;
}

// Mark read up to newest post, or /unread lands on page 1.
function markReadUpTo(threadId, unread, posts) {
  const cutoff = posts.reduce((max, post) => Math.max(max, Number(post.post_date) || 0), 0);
  if (!state.loggedIn || !unread || !cutoff) return;
  api.markThreadRead(threadId, cutoff).catch(() => {});
}

function wireSignatureToggles(root) {
  root.querySelectorAll('.message-signature').forEach((signature) => {
    const button = signature.nextElementSibling;
    if (!button?.matches('.signature-toggle') || signature.dataset.toggleReady) return;
    signature.dataset.toggleReady = 'true';
    if (signature.scrollHeight > signature.clientHeight + 1) button.hidden = false;
  });
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

// Anchor post top under sticky bars, not viewport center.
function jumpToPost(id) {
  return jumpToAnchor(id);
}

export async function viewThread(threadId, page, focusPost) {
  setActiveNav('home');
  loading();
  try {
    if (!state.reactions) {
      try {
        state.reactions = await cachedCatalog('reactions', () => api.reactions().then((r) => r.reactions || []));
      } catch {
        state.reactions = [];
      }
    }
    const [res] = await Promise.all([api.thread(threadId, page === 'last' ? 1 : page), loadSmilies()]);
    const thread = res.thread;
    const posts = res.posts || [];
    // Analytics: open on mount, read on unmount; _vozRead accumulates depth.
    signalOpen(thread.thread_id, 'other');
    if (window._vozRead?.id !== thread.thread_id) window._vozRead = { id: thread.thread_id, started: Date.now(), pages: new Set(), depth: 0, posts: 0 };
    window._vozRead.pages.add(res.pagination?.current_page || 1);
    window._vozRead.posts = Math.max(window._vozRead.posts, posts.length);
    if (!window._vozReadScrollWired) {
      window._vozReadScrollWired = true;
      window.addEventListener('scroll', () => {
        if (!window._vozRead) return;
        const height = Math.max(1, document.body.scrollHeight - innerHeight);
        window._vozRead.depth = Math.max(window._vozRead.depth, Math.round((window.scrollY / height) * 100));
      }, { passive: true });
      window.addEventListener('voz:leave-thread', () => {
        const read = window._vozRead;
        window._vozRead = null;
        if (read?.id) signalRead(read.id, Math.round((Date.now() - read.started) / 1000), read.posts, read.depth, read.pages.size);
      });
    }
    // [ATTACH] renders via the post's attachment list.
    clearAttachments();
    registerAttachments(posts);
    const forum = thread.Forum || {};

    // No "last page" API shortcut: resolve from pagination and refetch.
    if (page === 'last' && res.pagination && res.pagination.last_page > 1) {
      return viewThread(threadId, res.pagination.last_page, focusPost);
    }
    setThreadTitle(thread, res.pagination && res.pagination.current_page);
    setBreadcrumbs([
      { label: 'Diễn đàn', href: '/' },
      { label: forum.title || 'Chủ đề', href: forumPath(thread.Forum || { node_id: thread.node_id, title: '' }) },
    ]);

    const canReply = thread.can_reply;
    const watching = !!thread.is_watching;
    const authorHtml = `<a href="${userPath(thread.User || { user_id: thread.user_id, username: thread.username })}" class="pageNav-author">${ICON_USER}${esc(thread.username)}</a>`;
    app.innerHTML = `
      <div class="block block--messages">
        <div class="block-header">
          <span class="block-header-title" id="thread-title" tabindex="0" aria-label="${esc(thread.title)} — Trên mobile: giữ 1,5 giây hoặc nhấn Enter để bật/tắt theo dõi" style="user-select: text; -webkit-user-select: text; -webkit-touch-callout: default;">
            ${prefixLabel(thread)}${esc(thread.title)}
          </span>
          <span class="block-header-extra">${num(thread.reply_count, 'thread')} trả lời · ${num(thread.view_count, 'thread')} xem</span>
          ${moderationButtonHtml(thread)}
          <button type="button" class="block-header-icon${watching ? ' is-on' : ''}" id="watch-btn"
                  data-thread="${threadId}" data-watching="${watching ? '1' : '0'}"
                  title="${watching ? 'Bỏ theo dõi chủ đề' : 'Theo dõi chủ đề'}"
                  aria-label="${watching ? 'Bỏ theo dõi chủ đề' : 'Theo dõi chủ đề'}">
            ${watching ? ICON_EYE_ON : ICON_EYE_OFF}
          </button>
          ${moderationMenuHtml(thread)}
        </div>
        <div class="block-outer">
          <div class="block-outer-main">
                ${pagination(res.pagination, (p) => withPage(threadPath(thread), p), authorHtml, { scrollArm: false })}
          </div>
        </div>
        <div class="block-body" id="post-list">
          ${postEntriesHtml(posts, { thread, page: res.pagination ? res.pagination.current_page : 1 })}
        </div>
        <div class="block-outer block-outer--bottom" id="pager-slot">
          <div class="block-outer-main">
            ${pagination(res.pagination, (p) => withPage(threadPath(thread), p))}
          </div>
        </div>
      </div>
      <div id="reply-block">
        ${
          canReply
            ? `<form id="reply-form" class="block js-quickReply">
                 <div class="block-container">
                   <div class="block-body">
                     <div class="message message--quickReply block-topRadiusContent block-bottomRadiusContent">
                       <div class="message-inner">
                         ${quickReplyUserHtml()}
                         <div class="message-cell message-cell--main">
                           <div class="message-editorWrapper">
                             ${editorHtml('reply-message', '', 'Nội dung trả lời (BBCode)…', { thread_id: threadId })}
                             <div class="formButtonGroup">
                               <button class="button button--small editor-attach-button" type="button" title="Đính kèm tệp" aria-label="Đính kèm tệp">${ICON_ATTACH}<span class="button-text">Đính kèm tệp</span></button>
                               <div class="formButtonGroup-primary">
                                 <button class="button button--icon button--icon--reply button--primary" type="submit">${ICON_REPLY}<span class="button-text">Gửi trả lời</span></button>
                               </div>
                             </div>
                           </div>
                         </div>
                       </div>
                     </div>
                   </div>
                 </div>
               </form>`
            : `<div class="block"><div class="block-body block-body--pad"><p class="u-dimmed">Bạn không thể trả lời chủ đề này${state.loggedIn ? '' : ' — <a href="/login">đăng nhập</a>'}.</p></div></div>`
        }
      </div>`;

    wireEditor(app);
    wireMemberTooltips(app, posts.map((post) => post.User));
    wireThreadRowBans(document.getElementById('post-list'), posts.map((post) => post.User));
    wireThreadActions(threadId, posts, thread, res.pagination ? res.pagination.current_page : 1);
    wireModeration(thread, () => navigate(threadPath(thread), { replace: true }));
    wireSignatureToggles(app);
    wirePageJump((p) => withPage(threadPath(thread), p));
    wireScrollArm();
    hydrateReactionLists(app);
    // Per-page wiring (attachments, tooltips) repeats on each append.
    mountInfiniteScroll({
      makeHref: (p) => withPage(threadPath(thread), p),
      currentPage: res.pagination?.current_page || 1,
      lastPage: res.pagination?.last_page || 1,
      after: document.getElementById('pager-slot'),
      // threadPosts avoids re-fetching thread metadata per page.
      fetchPage: (p) => api.threadPosts(threadId, p),
      insert: (p, next) => {
        const list = document.getElementById('post-list');
        const more = next.posts || [];
        if (!list || !more.length) return 0;
        registerAttachments(more);
        list.insertAdjacentHTML('beforeend', postEntriesHtml(more, { thread, page: p }));
        wireThreadRowBans(list, more.map((post) => post.User));
        wireSignatureToggles(list);
        hydrateReactionLists(list);
        wireMemberTooltips(list, more.map((post) => post.User));
        for (const post of more) postIndex.set(post.post_id, post);
        markReadUpTo(threadId, thread.is_unread, more);
        return more.length;
      },
    });
    // Reading last page clears the bold title in forum listing.
    markReadUpTo(threadId, thread.is_unread, posts);

    if (focusPost) {
      // Permalink owns scroll even when post is off-page.
      keepCurrentScroll();
      jumpToPost(`post-${focusPost}`);
    } else if (location.hash.startsWith('#post-')) {
      if (jumpToPost(location.hash.slice(1))) keepCurrentScroll();
    }
  } catch (err) {
    app.innerHTML = errorBox(err);
  }
}

function wireThreadActions(threadId, posts, thread, page = 1) {
  postIndex.clear();
  for (const post of posts) postIndex.set(post.post_id, post);
  const byId = { get: (id) => postIndex.get(id) };
  const reload = (target, focus) => viewThread(threadId, target, focus);

  // Remove old listeners; a single slot caused double-fires.
  removeThreadClickHandlers();

  const onClick = async (event) => {
    const postTime = event.target.closest('[data-post-time]');
    if (postTime && matchMedia('(max-width: 620px)').matches) {
      event.preventDefault();
      event.stopPropagation();
      postTime.textContent = postTime.title;
      return;
    }
    const postNumberLink = event.target.closest('[data-post-number]');
    if (postNumberLink) {
      // No preventDefault: href is the real permalink.
      openPostNumberPopup(
        postNumberLink,
        thread,
        Number(postNumberLink.dataset.postPage) || 1,
        Number(postNumberLink.dataset.postNumber)
      );
      return;
    }

    const bookmarkBtn = event.target.closest('[data-bookmark]');    if (bookmarkBtn) {
      event.preventDefault();
      if (!state.loggedIn) return navigate('/login');
      if (bookmarkBtn.disabled) return;
      const post = byId.get(Number(bookmarkBtn.dataset.bookmark));
      if (!post) return;
      const next = !post.is_bookmarked;
      bookmarkBtn.disabled = true;
      try {
        await api.bookmarkPost(post.post_id, next);
        post.is_bookmarked = next;
        bookmarkBtn.setAttribute('aria-pressed', String(next));
        const label = next ? 'Bỏ đánh dấu' : 'Đánh dấu bài viết';
        bookmarkBtn.title = label;
        bookmarkBtn.setAttribute('aria-label', label);
        toast(next ? 'Đã đánh dấu bài viết' : 'Đã bỏ đánh dấu');
      } catch (err) {
        toast(err.message || 'Không cập nhật được đánh dấu', true);
      } finally {
        bookmarkBtn.disabled = false;
      }
      return;
    }

    const reactBtn = event.target.closest('[data-react]');
    if (reactBtn) {
      event.preventDefault();
      if (!state.loggedIn) return navigate('/login');
      if (reactBtn.getAttribute('aria-disabled') === 'true') return;
      const postId = Number(reactBtn.dataset.post);
      const reactionId = Number(reactBtn.dataset.react);
      const post = byId.get(postId);
      const article = reactBtn.closest('.message');
      const bar = article?.querySelector('.post-reactions');
      if (!post || !bar || bar.dataset.pending) return;
      bar.dataset.pending = 'true';
      bar.querySelectorAll('[data-react]').forEach((button) => button.setAttribute('aria-disabled', 'true'));
      try {
        const res = await api.react(postId, reactionId);
        const previous = Number(post.visitor_reaction_id) || 0;
        const next = res.action === 'delete' ? 0 : reactionId;
        const counts = { ...post.reaction_counts };
        if (previous) counts[previous] = Math.max(0, (Number(counts[previous]) || 0) - 1);
        if (next) counts[next] = (Number(counts[next]) || 0) + 1;
        post.reaction_counts = counts;
        post.visitor_reaction_id = next;
        post.is_reacted_to = !!next;
        invalidateReactionUsers(postId);
        article.querySelector('.reactionsBar')?.remove();
        article.querySelector('.message-footer').insertAdjacentHTML('beforeend', reactionSummary(post));
        hydrateReactionLists(article);
        toast(next ? 'Đã thả cảm xúc' : 'Đã bỏ cảm xúc');
      } catch (err) {
        toast(err.message || 'Không thả được cảm xúc', true);
      } finally {
        delete bar.dataset.pending;
        if (bar.isConnected) bar.innerHTML = reactionBar(post);
      }
      return;
    }

    const quoteLink = event.target.closest('[data-quote]');
    if (quoteLink) {
      event.preventDefault();
      if (!state.loggedIn) return navigate('/login');
      const post = byId.get(Number(quoteLink.dataset.quote));
      if (!post) return;
      // Trích dẫn: fill box, stay in place.
      if (!insertQuote(post)) return;
      toast('Đã trích dẫn vào khung trả lời');
      return;
    }

    const replyLink = event.target.closest('[data-reply]');
    if (replyLink) {
      event.preventDefault();
      if (!state.loggedIn) return navigate('/login');
      const post = byId.get(Number(replyLink.dataset.reply));
      if (!post) return;
      // Trả lời: quote and scroll to the box.
      if (!insertQuote(post)) return;
      const block = document.getElementById('reply-block');
      block?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      focusReplyEnd();
      return;
    }

    const editLink = event.target.closest('[data-edit]');
    if (editLink) {
      event.preventDefault();
      const post = byId.get(Number(editLink.dataset.edit));
      if (post) openInlineEdit(post, thread, page);
      return;
    }

    const deleteLink = event.target.closest('[data-delete]');
    if (deleteLink) {
      event.preventDefault();
      const postId = Number(deleteLink.dataset.delete);
      if (!confirm('Xoá bài viết này? (xoá mềm, không khôi phục được từ API)')) return;
      try {
        await api.deletePost(postId);
        toast('Đã xoá bài viết');
        await reload(page, null);
      } catch (err) {
        toast(err.message || 'Không xoá được', true);
      }
      return;
    }

    const reportLink = event.target.closest('[data-report]');
    if (reportLink) {
      event.preventDefault();
      if (!state.loggedIn) return navigate('/login');
      openReportModal(Number(reportLink.dataset.report));
      return;
    }

    const warnLink = event.target.closest('[data-warn]');
    if (warnLink) {
      event.preventDefault();
      openWarnModal(Number(warnLink.dataset.warn), () => reload(page, null));
    }
  };

  app._threadHandler = onClick;
  threadClickHandlers.push(onClick);
  app.addEventListener('click', onClick);

  const watchBtn = document.getElementById('watch-btn');
  if (watchBtn) {
    watchBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      if (!state.loggedIn) return navigate('/login');
      if (watchBtn.disabled) return;
      const watching = watchBtn.dataset.watching === '1';
      watchBtn.disabled = true;
      watchBtn.setAttribute('aria-disabled', 'true');
      try {
        await api.watchThread(Number(watchBtn.dataset.thread), !watching);
        const nowWatching = !watching;
        watchBtn.dataset.watching = nowWatching ? '1' : '0';
        watchBtn.classList.toggle('is-on', nowWatching);
        watchBtn.innerHTML = nowWatching ? ICON_EYE_ON : ICON_EYE_OFF;
        const label = nowWatching ? 'Bỏ theo dõi chủ đề' : 'Theo dõi chủ đề';
        watchBtn.title = label;
        watchBtn.setAttribute('aria-label', label);
        toast(nowWatching ? 'Đã theo dõi chủ đề' : 'Đã bỏ theo dõi');
      } catch (err) {
        toast(err.message || 'Không đổi được trạng thái theo dõi', true);
      } finally {
        watchBtn.disabled = false;
        watchBtn.removeAttribute('aria-disabled');
      }
    });
    wireTitleHold(document.getElementById('thread-title'), () => watchBtn.click());
  }

  const form = document.getElementById('reply-form');
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const textarea = document.getElementById('reply-message');
      const message = textarea.value.trim();
      if (!message) return toast('Nội dung trống', true);
      const submit = form.querySelector('button[type=submit]');
      const submitLabel = submit.querySelector('.button-text') || submit;
      submit.disabled = true;
      submitLabel.textContent = 'Đang gửi…';
      try {
        const uploads = form.querySelector('.rich-editor')?._uploads;
        const attachmentKey = uploads ? await uploads.attachmentKeyOrNull().catch(() => null) : null;
        const body = { thread_id: threadId, message };
        if (attachmentKey) body.attachment_key = attachmentKey;
        const res = await fetch('/api/xf/posts/', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams(body).toString(),
        });
        const payload = await res.json();
        if (!res.ok) throw new ApiError(res.status, payload);
        clearEditorDraft(textarea);
        toast('Đã gửi trả lời');
        // Reply payload carries pagination; navigate straight to last page.
        const lastPage = Number(payload.pagination?.last_page);
        if (lastPage) {
          navigate(`${withPage(threadPath(thread), lastPage)}?post=${payload.post.post_id}`);
        } else {
          // Fallback: resolve 'last' via the view.
          await viewThread(threadId, 'last', payload.post.post_id);
        }
      } catch (err) {
        toast(err.message || 'Gửi thất bại', true);
        submit.disabled = false;
        submitLabel.textContent = 'Gửi trả lời';
      }
    });
  }
}
