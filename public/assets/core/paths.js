// voz.vn-style URLs: /t/<slug>.<id>/page-<n>. The slug is cosmetic; the id is what the API uses.

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Numeric id from "<slug>.<id>" or "<id>".
export function idFromSegment(segment) {
  const raw = String(segment || '');
  const tail = raw.includes('.') ? raw.slice(raw.lastIndexOf('.') + 1) : raw;
  return Number(tail) || 0;
}

export function threadPath(thread) {
  const slug = slugify(thread.title);
  return slug ? `/t/${slug}.${thread.thread_id}/` : `/t/${thread.thread_id}/`;
}

// voz.vn's /unread jump; the server resolves it to /page-N#post-<id>.
export function threadUnreadPath(thread) {
  return `${threadPath(thread)}unread`;
}

export function forumPath(forum) {
  const slug = slugify(forum.title);
  return slug ? `/f/${slug}.${forum.node_id}/` : `/f/${forum.node_id}/`;
}

// Aggregated cross-forum nodes use /s/ on voz.vn.
export function searchForumPath(node) {
  const slug = slugify(node.title);
  return slug ? `/s/${slug}.${node.node_id}/` : `/s/${node.node_id}/`;
}

export function userPath(user) {
  const slug = slugify(user.username);
  return slug ? `/u/${slug}.${user.user_id}/` : `/u/${user.user_id}/`;
}

export function dmPath(conversation) {
  const slug = slugify(conversation.title);
  return slug
    ? `/direct-messages/${slug}.${conversation.conversation_id}/`
    : `/direct-messages/${conversation.conversation_id}/`;
}

// voz.vn omits /page-1 and keeps the trailing slash.
export function withPage(path, page) {
  const n = Number(page) || 1;
  const base = path.endsWith('/') ? path : `${path}/`;
  return n > 1 ? `${base}page-${n}/` : base;
}

// XenForo reports a post's 0-based `position`; the page it lives on needs the per-page size.
export function postPage(post, perPage) {
  const position = Number(post && post.position);
  const size = Number(perPage) || 20;
  if (!Number.isFinite(position) || position < 0) return null;
  return Math.floor(position / size) + 1;
}

// Permalink to one post: the page that carries it plus the fragment the view scrolls to. `/t/<slug>.123/?post=<id>`
// cannot resolve the page on its own, so every list that knows where the post sits (search results, bookmarks,
// member activity) builds its rows through here — otherwise a post past the first page has no element to jump to
// and the thread opens at the top.
export function postPath(post, thread, perPage) {
  const page = postPage(post, perPage);
  return `${withPage(threadPath({ thread_id: post.thread_id || thread?.thread_id, title: thread?.title }), page || 1)}#post-${post.post_id}`;
}
