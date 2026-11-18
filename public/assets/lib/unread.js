// "Jump to first unread post", like voz.vn's /t/<id>/unread. The API exposes the visitor's read mark as
// `visitor_read_date` — written by mark-read with a page-cutoff date; voz.vn discards cutoffs older than its
// retention window, and marks never regress. There is no first-unread id, so the page is found by walking back
// from the end (cheap when the reader is near it, the common case while read marks are kept fresh) and by
// binary search over page numbers for larger unread spans, which a short fixed walk could never bridge.

// The API's fixed page size, verified against /api/threads (list and posts endpoints alike).
export const POSTS_PER_PAGE = 20;

// Walk up to 3 pages back from the end, then binary-search the rest: ~log2(pages) probes worst case.
const END_WALK = 3;

export function threadLastPage(thread) {
  return Math.max(1, Math.ceil(((Number(thread.reply_count) || 0) + 1) / POSTS_PER_PAGE));
}

// Returns { page, postId } for the first unread post, or null when nothing could be bracketed.
// `visitorReadDate` null/0 means the thread was never opened (or the mark aged out), so page 1 is correct,
// like voz.vn.
export async function resolveUnread({ thread, visitorReadDate, fetchPostPage }) {
  const readDate = Number(visitorReadDate) || 0;
  if (!readDate) return { page: 1, postId: null };
  const lastPage = threadLastPage(thread);
  if (lastPage <= 1) return { page: 1, postId: null };

  // Walk back from the end: every unread page becomes the candidate until a fully read page brackets it.
  let found = null;
  let page = lastPage;
  for (let walked = 0; walked < END_WALK && page >= 1; walked += 1, page -= 1) {
    let posts;
    try {
      posts = (await fetchPostPage(page)).posts;
    } catch {
      return found;
    }
    if (!posts || !posts.length) return found;
    const firstUnread = posts.find((post) => (Number(post.post_date) || 0) > readDate);
    if (!firstUnread) break; // page fully read: the candidate from a later page stands
    found = { page, postId: firstUnread.post_id };
    if (page === 1 || (Number(posts[0].post_date) || 0) <= readDate) return found; // exact page
    // The whole page is unread, so the first unseen post may sit earlier; check the page before it.
    backward = true;
  }
  if (!found) return null;

  // Binary search pages [1, page] for the first page whose opening post postdates the read mark: posts are
  // date-ordered across pages, so every page before it is fully read and its opening post is the first unseen
  // post.
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
