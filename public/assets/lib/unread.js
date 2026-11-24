/** Unread finder. */

// Fixed API page size on threads list and posts endpoints alike.
export const POSTS_PER_PAGE = 20;

// Walk back from the end, then binary-search the rest.
const END_WALK = 3;

export function threadLastPage(thread) {
  return Math.max(1, Math.ceil(((Number(thread.reply_count) || 0) + 1) / POSTS_PER_PAGE));
}

// { page, postId } of first unread post, or null. Null/0 visitorReadDate (never
// opened or aged out) means page 1, like voz.vn.
export async function resolveUnread({ thread, visitorReadDate, fetchPostPage }) {
  const readDate = Number(visitorReadDate) || 0;
  if (!readDate) return { page: 1, postId: null };
  const lastPage = threadLastPage(thread);
  if (lastPage <= 1) return { page: 1, postId: null };

  // Walk back from the end: every unread page becomes the candidate until a fully read page brackets it.
  let found = null;
  let page = lastPage;
  let bracketed = false;
  for (let walked = 0; walked < END_WALK && page >= 1; walked += 1, page -= 1) {
    let posts;
    try {
      posts = (await fetchPostPage(page)).posts;
    } catch {
      return found;
    }
    if (!posts || !posts.length) return found;
    const firstUnread = posts.find((post) => (Number(post.post_date) || 0) > readDate);
    if (!firstUnread) {
      // Page fully read: the later-page candidate stands; no search needed.
      bracketed = true;
      break;
    }
    found = { page, postId: firstUnread.post_id };
    if (page === 1 || (Number(posts[0].post_date) || 0) <= readDate) return found; // exact page
    // Whole page unread: the first unseen post may sit on an earlier page.
  }
  if (!found) return null;
  if (bracketed) return found;

  // Posts are date-ordered across pages; binary-search the first page
  // whose opening post postdates the read mark.
  let lo = 1;
  let hi = page;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    let posts;
    try {
      posts = (await fetchPostPage(mid)).posts;
    } catch {
      break;
    }
    if (!posts || !posts.length) break;
    if ((Number(posts[0].post_date) || 0) > readDate) {
      found = { page: mid, postId: posts[0].post_id };
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return found;
}
