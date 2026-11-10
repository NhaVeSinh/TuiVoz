// "Jump to first unread post", like voz.vn's /t/<id>/unread. The API exposes no first-unread id, only
// `visitor_read_date`, so the page is derived by walking back from the last page.

const POSTS_PER_PAGE = 20;

// Upper bound on post-page requests. Falling back to page 1 is better than a long chain.
const MAX_PAGE_WALKS = 12;

export function threadLastPage(thread) {
  return Math.max(1, Math.ceil(((Number(thread.reply_count) || 0) + 1) / POSTS_PER_PAGE));
}

// Returns { page, postId } for the first unread post, or null when there is nothing unread. `visitorReadDate`
// null/0 means the thread was never opened, so page 1 is correct.
export async function resolveUnread(
  { visitorReadDate, lastPage },
  fetchPostPage,
  { maxWalks = MAX_PAGE_WALKS } = {}
) {
  const readDate = Number(visitorReadDate) || 0;
  if (!readDate) return { page: 1, postId: null };

  const last = Math.max(1, Number(lastPage) || 1);
  let found = null;

  for (let walked = 0, page = last; page >= 1 && walked < maxWalks; page -= 1, walked += 1) {
    let posts;
    try {
      const res = await fetchPostPage(page);
      posts = res && res.posts;
    } catch {
      break; // keep whatever a later page already produced
    }
    if (!posts || !posts.length) break;

    const firstUnread = posts.find((post) => (Number(post.post_date) || 0) > readDate);
    if (!firstUnread) break; // whole page already read → every earlier page is too
    found = { page, postId: firstUnread.post_id };
  }

  return found;
}
