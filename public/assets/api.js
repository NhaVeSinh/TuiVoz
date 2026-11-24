/** Edge API client. */

const XF = '/api/xf';

export class ApiError extends Error {
  constructor(status, payload) {
    const first = payload && payload.errors && payload.errors[0];
    // `error` can be a Vercel object ({ code, message }), not a string.
    const rawError = payload && payload.error;
    const errorText = rawError && typeof rawError === 'object' ? rawError.message || rawError.code : rawError;
    super((first && first.message) || (errorText ? String(errorText) : '') || `HTTP ${status}`);
    this.status = status;
    this.code = first && first.code;
    this.params = (first && first.params) || [];
    this.payload = payload;
  }
}

function encodeQuery(query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(`${key}[]`, String(item));
    } else if (typeof value === 'boolean') {
      params.append(key, value ? '1' : '0');
    } else {
      params.append(key, String(value));
    }
  }
  return params;
}

export async function xf(path, { method = 'GET', query, body, json, form } = {}) {
  const qs = encodeQuery(query).toString();
  const url = `${XF}${path}${qs ? `?${qs}` : ''}`;
  const init = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = encodeQuery(body).toString();
  } else if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  } else if (form !== undefined) {
    // FormData sets its own boundary Content-Type; never override.
    init.body = form;
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { error: 'bad_response', raw: text.slice(0, 300) };
  }
  if (!res.ok) throw new ApiError(res.status, payload);
  return payload;
}

export const api = {
  me: () => xf('/me/'),
  nodes: () => xf('/nodes/'),
  forum: (id) => xf(`/forums/${id}/`),
  forumThreads: (id, page = 1) => xf(`/forums/${id}/threads`, { query: { page } }),
  searchForum: (id) => xf(`/search-forums/${id}/`),
  searchForumThreads: (id, page = 1) => xf(`/search-forums/${id}/threads`, { query: { page } }),
  threads: (page = 1, order = 'post_date') => xf('/threads/', { query: { page, order } }),
  thread: (id, page = 1) => xf(`/threads/${id}/`, { query: { with_posts: 'true', page } }),
  // Thread metadata only, without the post bodies.
  threadMeta: (id) => xf(`/threads/${id}/`),
  threadPosts: (id, page = 1) => xf(`/threads/${id}/posts`, { query: { page } }),
  post: (id) => xf(`/posts/${id}/`),
  createPost: (threadId, message, attachmentKey) =>
    xf('/posts/', { method: 'POST', body: { thread_id: threadId, message, attachment_key: attachmentKey } }),
  editPost: (id, message, extra) => xf(`/posts/${id}/`, { method: 'POST', body: { message, ...extra } }),
  deletePost: (id, opts) => xf(`/posts/${id}/`, { method: 'DELETE', query: opts }),
  react: (id, reactionId) => xf(`/posts/${id}/react`, { method: 'POST', body: { reaction_id: reactionId } }),
  reactions: () => xf('/voz/reactions'),
  reportPost: (id, message) => xf(`/voz/posts/${id}/report`, { method: 'POST', body: { message } }),
  warnings: () => xf('/voz/warnings'),
  warnPost: (id, warningDefinitionId) => xf(`/voz/posts/${id}/warn`, { method: 'POST', body: { warning_definition_id: warningDefinitionId } }),
  // Thread moderation.
  updateThread: (id, fields) => xf(`/threads/${id}/`, { method: 'POST', body: fields }),
  moveThread: (id, targetNodeId, starterAlert) =>
    xf(`/threads/${id}/move`, { method: 'POST', body: { target_node_id: targetNodeId, starter_alert: starterAlert } }),
  deleteThread: (id, opts) => xf(`/threads/${id}/`, { method: 'DELETE', query: opts }),
  // App attachment flow: key → upload → attachment_key on post.
  attachmentKey: (context) =>
    xf('/attachments/new-key', {
      method: 'POST',
      body: { type: 'post', ...Object.fromEntries(Object.entries(context || {}).map(([k, v]) => [`context[${k}]`, v])) },
    }),
  uploadAttachment: (key, file) => {
    const form = new FormData();
    form.append('key', key);
    form.append('attachment', file, file.name || 'attachment');
    return xf('/attachments', { method: 'POST', form });
  },
  deleteAttachment: (id, key) => xf(`/attachments/${id}/`, { method: 'DELETE', query: key ? { key } : undefined }),
  conversations: (page = 1, filter) => xf('/conversations/', { query: { page, ...filter } }),
  conversation: (id, page = 1) => xf(`/conversations/${id}/`, { query: { with_messages: 'true', page } }),
  // Message carries conversation_id, which alert payloads omit.
  conversationMessage: (id) => xf(`/conversation-messages/${id}/`),
  createConversation: (recipientIds, title, message) =>
    xf('/conversations/', { method: 'POST', body: { recipient_ids: recipientIds, title, message } }),
  replyConversation: (conversationId, message) =>
    xf('/conversation-messages/', { method: 'POST', body: { conversation_id: conversationId, message } }),
  // Author-only; DELETE answers 404 invalid_method.
  editConversationMessage: (messageId, message) =>
    xf(`/conversation-messages/${messageId}/`, { method: 'POST', body: { message } }),
  conversationMessages: (id, page = 1) => xf(`/conversations/${id}/messages`, { query: { page } }),
  leaveConversation: (id) => xf(`/conversations/${id}/`, { method: 'DELETE' }),
  alerts: (page = 1) => xf('/alerts/', { query: { page } }),
  alert: (id) => xf(`/alerts/${id}/`),
  markAlertsViewed: () => xf('/alerts/mark-all', { method: 'POST', body: { viewed: true } }),
  markAlertRead: (id) => xf(`/alerts/${id}/mark`, { method: 'POST', body: { read: true } }),
  markConversationRead: (id, date) => xf(`/conversations/${id}/mark-read`, { method: 'POST', body: { date } }),
  markThreadRead: (id, date) => xf(`/threads/${id}/mark-read`, { method: 'POST', body: { date } }),
  unviewedAlerts: () => xf('/alerts/', { query: { unviewed: true } }),
  unreadConversations: () => xf('/conversations/', { query: { unread: true } }),
  bookmarkPost: (postId, bookmark) => xf(`/voz/posts/${postId}/bookmark`, { method: 'POST', body: { state: bookmark ? 'bookmark' : 'unbookmark' } }),
  bookmarks: (page = 1) => xf('/voz/bookmarks', { query: { page } }),
  watched: (page = 1) => xf('/voz/watched-threads', { query: { page } }),
  watchThread: (threadId, watch) =>
    xf(`/voz/threads/${threadId}/watch`, { method: 'POST', body: { state: watch ? 'watch' : 'unwatch' } }),
  user: (id) => xf(`/users/${id}/`),
  findUser: (username) => xf('/users/find-name', { query: { username } }),
  // Profile wall (profile_post:read).
  profilePosts: (userId, page = 1) => xf(`/users/${userId}/profile-posts`, { query: { page } }),
  profilePost: (id, page = 1) => xf(`/profile-posts/${id}/`, { query: { with_comments: 1, page } }),
  profilePostComment: (id) => xf(`/profile-post-comments/${id}/`),
  profilePostComments: (id, page = 1) => xf(`/profile-posts/${id}/comments`, { query: { page } }),
  // Needs profile_post:write; expect a missing_scope 403.
  createProfilePost: (userId, message) => xf('/profile-posts/', { method: 'POST', body: { user_id: userId, message } }),
  createProfilePostComment: (postId, message) => xf(`/profile-posts/${postId}/comments`, { method: 'POST', body: { message } }),
  search: (keywords) => xf('/search/', { method: 'POST', body: { keywords, search_type: 'post', order: 'date' } }),
  searchMember: (userId, content = 'post') => xf('/search/member', { method: 'POST', body: content ? { user_id: userId, content } : { user_id: userId } }),
  // `before` is a unix-date cursor for paging expired searches.
  searchOlder: (searchId, before) => xf(`/search/${searchId}/older`, { method: 'POST', body: { search_id: searchId, before } }),
  createThread: (nodeId, title, message, prefixId, attachmentKey) =>
    xf('/threads/', { method: 'POST', body: { node_id: nodeId, title, message, prefix_id: prefixId, attachment_key: attachmentKey } }),
  searchResults: (searchId, page = 1) => xf(`/search/${searchId}/`, { query: { page } }),
  stats: () => xf('/stats'),
  appConfig: () => xf('/voz/app-config'),
  // Batched analytics, flushed on pagehide.
  signals: (events) => xf('/voz/signals', { method: 'POST', json: { events } }),
};

export const auth = {
  status: async () => {
    const res = await fetch('/api/oauth/status', { credentials: 'same-origin' });
    return res.json();
  },
  exchange: async (code, verifier) => {
    const res = await fetch('/api/oauth/exchange', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, verifier }),
    });
    return { ok: res.ok, data: await res.json() };
  },
  logout: async () => {
    await fetch('/api/oauth/logout', { method: 'POST', credentials: 'same-origin' });
  },
  config: async () => {
    const res = await fetch('/api/config');
    return res.json();
  },
};
