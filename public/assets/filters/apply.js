// Bộ lọc — áp dụng lên DOM.
//
// Ba hành động theo filter khớp đầu tiên (ưu tiên trên xuống):
//   delete    — không render gì cả.
//   hide      — render bình thường nhưng bọc trong .filtered-block: một dòng mờ kèm nút "Chạm để hiện"
//               hiển thị lý do (tên filter); click toggle nội dung.
//   highlight — render bình thường, thêm viền trái + nền mờ theo màu người dùng chọn.
//
// Các view gọi threadEntriesHtml()/postEntriesHtml() thay cho `.map(...).join('')`; mỗi hàm trả một chuỗi
// HTML gộp cho cả danh sách. Nút hiện/ẩn được xử lý bởi một listener toàn cục duy nhất (wireFilteredReveals).

import { esc } from '../core/utils.js';
import { matchingFilter } from './match.js';
import { filtersForScope } from './filters.js';
import { threadRow } from '../ui/threadRow.js';
import { postHtml } from '../ui/post.js';
import { ICON_EYE_ON, ICON_EYE_OFF } from '../core/icons.js';

// Inline style for a highlighted item: a thin coloured border around the whole item. Inline (not a class)
// because the colour is per-filter user data. A real border (not box-shadow) so the ring hugs the
// element's rounded corners; the element already keeps its own padding, so no layout shift shows.
function highlightStyle(filter) {
  const color = filter?.color || '#ff6600';
  return `border: 1.5px solid ${color};`;
}

// The "see-through" box that stands in for a hidden item. Both thread rows and posts sit inside <div>
// containers and each row is itself an <li>/<article> — wrapping in another <li> would let the HTML parser
// hoist the inner row out (an <li> start tag closes an open <li> in list-item scope), so `tag` is `div`.
export function hiddenBlock(contentHtml, filter, { noun, anchorId = '', tag = 'div' } = {}) {
  const reason = filter?.name || 'Bộ lọc';
  return `<${tag} class="filtered-block"${anchorId ? ` id="${esc(anchorId)}"` : ''}>
    <button type="button" class="filtered-reveal" aria-expanded="false">
      ${ICON_EYE_OFF}<span class="filtered-reveal-off">Đã ẩn ${noun} bởi bộ lọc “${esc(reason)}” — Chạm để hiện</span><span class="filtered-reveal-on" hidden>${ICON_EYE_ON} Đang hiển ${noun} — chạm để ẩn lại</span>
    </button>
    <div class="filtered-content" hidden>${contentHtml}</div>
  </${tag}>`;
}

// Renders a thread-list group, applying "Danh sách chủ đề" filters per row. `rowOpts` is forwarded to
// threadRow ({ sticky, showForum }).
export function threadEntriesHtml(threads, rowOpts = {}) {
  const list = Array.isArray(threads) ? threads : [];
  const filters = filtersForScope('threads');
  if (!filters.length) return list.map((t) => threadRow(t, rowOpts)).join('');
  return list.map((thread) => {
    const filter = matchingFilter(filters, { kind: 'threads', thread });
    if (!filter) return threadRow(thread, rowOpts);
    if (filter.action === 'delete') return '';
    if (filter.action === 'highlight') {
      return threadRow(thread, { ...rowOpts, extraClass: 'is-filter-highlighted', extraStyle: highlightStyle(filter) });
    }
    return hiddenBlock(threadRow(thread, rowOpts), filter, { noun: 'chủ đề' });
  }).join('');
}

// Renders a post/message list, applying "Bài viết trong chủ đề" filters per item.
//   items      — posts (or conversation messages, or search/bookmark rows carrying .Post/.Thread)
//   kind       — 'thread' (default) or 'conversation' for postHtml
//   getPost    — item → the post object the filters read; default is the item itself
//   getThread  — item → containing thread; default uses `thread` for every item or item.Thread
//   page       — thread page number for permalinks
//   renderPost — (item, extra) → html for a visible/hidden/highlighted item; default is postHtml.
//                Search/bookmark callers pass postRow so post filters also work on their lists.
export function postEntriesHtml(items, { kind = 'thread', thread = null, getPost = null, getThread = null, page = 1, renderPost = null } = {}) {
  const list = Array.isArray(items) ? items : [];
  const filters = filtersForScope('posts');
  const itemPost = (item) => (getPost ? getPost(item) : item) || {};
  const itemThread = (item) => (getThread ? getThread(item) : thread || item?.Thread || itemPost(item)?.Thread || null);
  const render =
    renderPost ||
    ((item, extra) => postHtml(itemPost(item), itemThread(item), page, kind, extra));
  if (!filters.length) return list.map((item) => render(item, {})).join('');
  return list.map((item) => {
    const post = itemPost(item);
    const filter = matchingFilter(filters, { kind: 'posts', thread: itemThread(item), post });
    if (!filter) return render(item, {});
    if (filter.action === 'delete') return '';
    if (filter.action === 'highlight') {
      return render(item, { extraClass: 'is-filter-highlighted', extraStyle: highlightStyle(filter) });
    }
    // Hidden posts keep their anchor on the wrapper so #post-N permalinks land on the placeholder; the real
    // article gets a renamed id to avoid duplicate ids while it stays in the DOM.
    const rawId = Number(post?.post_id || post?.message_id || 0);
    const anchorId = kind === 'conversation' ? `conversation-message-${rawId}` : `post-${rawId}`;
    const noun = kind === 'conversation' ? 'tin nhắn' : 'bài viết';
    const inner = render(item, { id: `filtered-${anchorId}` });
    return hiddenBlock(inner, filter, { noun, anchorId: rawId ? anchorId : '', tag: 'div' });
  }).join('');
}

// Un-hides the .filtered-block containing `el` (or the element itself) — used by the reveal button and by
// the permalink helpers so a hidden post/thread still opens when a link points at it.
export function revealFilteredBlock(el) {
  const block = el?.closest?.('.filtered-block') || (el?.classList?.contains('filtered-block') ? el : null);
  if (!block) return;
  const content = block.querySelector(':scope > .filtered-content');
  if (content) content.hidden = false;
  const button = block.querySelector(':scope > .filtered-reveal');
  if (button) setRevealButton(button, true);
}

function setRevealButton(button, open) {
  button.setAttribute('aria-expanded', String(open));
  const off = button.querySelector('.filtered-reveal-off');
  const on = button.querySelector('.filtered-reveal-on');
  if (off) off.hidden = open;
  if (on) on.hidden = !open;
}

// One delegated listener for every reveal button, plus hashchange support so a #post-N link re-opens a
// hidden post even when it arrives after render.
let wired = false;
export function wireFilteredReveals() {
  if (wired) return;
  wired = true;
  document.addEventListener('click', (event) => {
    const button = event.target.closest('.filtered-reveal');
    if (!button) return;
    const content = button.parentElement?.querySelector(':scope > .filtered-content');
    if (!content) return;
    const open = content.hidden;
    content.hidden = !open;
    setRevealButton(button, open);
  });
  window.addEventListener('hashchange', () => {
    const el = document.getElementById(location.hash.slice(1));
    if (el) revealFilteredBlock(el);
  });
}
