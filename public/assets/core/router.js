// History-API router. The page number lives in the path (/t/slug.123/page-2).

import { app } from './dom.js';
import { idFromSegment, threadPath, dmPath, withPage, postPage } from './paths.js';
import { api } from '../api.js';
import { navigate } from './nav.js';
import { setRouteHandler } from './nav.js';
import { errorBox, finishLoading } from '../ui/feedback.js';
import { resolveUnread } from '../lib/unread.js';
import { viewHome, viewForum, viewSearchForum, viewNewThreads } from '../views/forum.js';
import { viewThread } from '../views/thread.js';
import { viewSearch } from '../views/search.js';
import { viewDmList, viewDm, viewNewDm } from '../views/dm.js';
import { viewAlerts, viewBookmarks, viewWatched } from '../views/lists.js';
import { viewUser, viewProfilePost } from '../views/user.js';
import { viewLogin } from '../views/login.js';
import { viewCompose } from '../views/compose.js';
import { viewSettings } from '../views/settings.js';
import { refreshUnreadCounts } from '../ui/unreadCounts.js';
import { teardownInfiniteScroll } from '../ui/infiniteScroll.js';
import { setTitle } from '../ui/title.js';

export function parsePath() {
  const segments = location.pathname.split('/').filter(Boolean);
  const params = new URLSearchParams(location.search);
  let page = 1;
  const last = segments[segments.length - 1] || '';
  const pageMatch = last.match(/^page-(\d+)$/);
  if (pageMatch) {
    page = Number(pageMatch[1]) || 1;
    segments.pop();
  }
  if (params.get('page')) page = Number(params.get('page')) || page;
  return { segments, params, page };
}

// Resolves a thread's first unread post. A read thread falls back to page 1 with no post, like voz.vn. The
// thread object comes back so the caller keeps the canonical slug.
async function unreadTarget(threadId) {
  // One bare probe carries everything resolution needs — is_unread, visitor_read_date and the thread's date
  // range — so no post bodies and no fallback fetch.
  const head = await api.threadMeta(threadId);
  const thread = head.thread || { thread_id: threadId, title: '' };
  if (!thread.is_unread) return { thread, page: 1, postId: null };
  const target = await resolveUnread({
    thread,
    visitorReadDate: thread.visitor_read_date,
    fetchPostPage: (p) => api.threadPosts(threadId, p),
  });
  if (!target) return { thread, page: 1, postId: null };
  return { thread, page: target.page, postId: target.postId };
}

// Page, thread and title for one post id: `?post=` links and `/p/{id}/` both need to know which page a post
// lives on before the thread can be rendered there.
async function postLocation(postId) {
  try {
    const { post } = await api.post(postId);
    const threadId = Number(post?.thread_id || post?.Thread?.thread_id) || 0;
    if (!threadId) return null;
    const res = await api.thread(threadId, 1);
    const title = res.thread?.title || post.Thread?.title || '';
    const page = postPage(post, res.pagination?.per_page);
    if (!page) return null;
    return { threadId, page, title };
  } catch {
    return null;
  }
}

export async function route() {
  const { segments, params, page } = parsePath();
  const head = segments[0] || '';
  teardownInfiniteScroll({ keepSentinel: true });
  // Leaving the thread screen fires the queued `read` signal (see views/thread.js).
  if (head !== 't') window.dispatchEvent(new Event('voz:leave-thread'));

  try {
    if (!head) return await viewHome();
    if (head === 'p' && /^\d+$/.test(segments[1] || '')) {
      const target = await postLocation(Number(segments[1]));
      if (!target) throw new Error('Không xác định được trang của bài viết');
      return navigate(`${withPage(threadPath({ thread_id: target.threadId, title: target.title }), target.page)}#post-${segments[1]}`, { replace: true });
    }
    if (head === 'f' && segments[2] === 'post-thread') return await viewCompose(idFromSegment(segments[1]));
    if (head === 'f') return await viewForum(idFromSegment(segments[1]), page);
    if (head === 's') return await viewSearchForum(idFromSegment(segments[1]), page);
    if (head === 't') {
      const threadId = idFromSegment(segments[1]);
      const focusPost = Number(params.get('post')) || null;
      // /t/<slug>.<id>/unread — resolve the page, then replace the URL like voz.vn's redirect.
      if (segments[2] === 'unread') {
        const target = await unreadTarget(threadId);
        const href = `${withPage(threadPath(target.thread), target.page)}${target.postId ? `#post-${target.postId}` : ''}`;
        return navigate(href, { replace: true });
      }
      // A bare `?post=` carries no page, so the thread would open at the top whenever the post is past page 1.
      // As `/p/{id}/` does, resolve the page from the post's position and rewrite the URL to the form everything
      // else links with.
      if (focusPost) {
        const target = await postLocation(focusPost);
        // A post that no longer resolves (deleted) falls through: the thread opens normally instead of erroring.
        if (target) {
          const href = `${withPage(threadPath({ thread_id: target.threadId, title: target.title }), target.page)}#post-${focusPost}`;
          if (`${location.pathname}${location.search}${location.hash}` !== href) return await navigate(href, { replace: true });
          if (target.threadId === threadId) return await viewThread(threadId, target.page, focusPost);
        }
      }
      return await viewThread(threadId, page, focusPost);
    }
    if (head === 'new') return await viewNewThreads(page);
    if (head === 'search') return await viewSearch(params.get('q') || '', params.get('id'), page);
    if (head === 'direct-messages' || head === 'dm') {
      // voz.vn alert URLs point here for a reacted DM message; the message resolves its conversation.
      if (segments[1] === 'replies' && /^\d+$/.test(segments[2] || '')) {
        const messageId = Number(segments[2]);
        const { message } = await api.conversationMessage(messageId);
        const conversationId = message && message.conversation_id;
        if (!conversationId) throw new Error('Không xác định được hộp thư của tin nhắn');
        const result = await api.conversation(conversationId, 1);
        const conversation = result.conversation || { conversation_id: conversationId, title: '' };
        return navigate(`${dmPath(conversation)}#conversation-message-${messageId}`, { replace: true });
      }
      if (segments[1] === 'new') return await viewNewDm(params.get('to') || '');
      if (segments[1]) return await viewDm(idFromSegment(segments[1]), page);
      return await viewDmList(page);
    }
    if (head === 'alerts') return await viewAlerts(page);
    if (head === 'bookmarks') return await viewBookmarks(page);
    if (head === 'watched') return await viewWatched(page);
    if (head === 'u') return await viewUser(idFromSegment(segments[1]), params, segments[2] || '');
    if (head === 'pp' && /^\d+$/.test(segments[1] || '')) return await viewProfilePost(Number(segments[1]), page);
    // voz URLs: /profile-posts/{id}/ → single post; /profile-posts/comments/{id}/ → comment, resolves to parent post.
    if (head === 'profile-posts') {
      if (segments[1] === 'comments' && /^\d+$/.test(segments[2] || '')) {
        const commentId = Number(segments[2]);
        try {
          const res = await api.profilePostComment(commentId);
          const postId = res?.comment?.profile_post_id || res?.profile_post_comment?.profile_post_id;
          if (postId) return await viewProfilePost(postId, page, `profile-post-comment-${commentId}`);
        } catch { /* fall through */ }
        return navigate('/alerts', { replace: true });
      }
      if (/^\d+$/.test(segments[1] || '')) return await viewProfilePost(Number(segments[1]), page);
    }
    if (head === 'cai-dat-tuivoz') return viewSettings();
    if (head === 'login') return await viewLogin();
    setTitle('Oops! We ran into some problems.');
    app.innerHTML = '<div class="empty">Không tìm thấy trang.</div>';
  } catch (err) {
    // voz.vn's own error title.
    setTitle('Oops! We ran into some problems.');
    app.innerHTML = errorBox(err);
  } finally {
    finishLoading();
    refreshUnreadCounts();
  }
}

setRouteHandler(route);
