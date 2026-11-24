/** Apply filters to DOM. */

import { esc } from '../core/utils.js';
import { matchingFilter } from './match.js';
import { filtersForScope } from './filters.js';
import { threadRow } from '../ui/threadRow.js';
import { postHtml } from '../ui/post.js';
import { ICON_EYE_ON, ICON_EYE_OFF } from '../core/icons.js';

// Inline style, not a class: the border colour is per-filter user data.
function highlightStyle(filter) {
  const color = filter?.color || '#ff6600';
  return `border: 1.5px solid ${color};`;
}

// Placeholder for a hidden item; tag is div because a wrapping <li> breaks list-item parsing.
export function hiddenBlock(contentHtml, filter, { noun, anchorId = '', tag = 'div' } = {}) {
  const reason = filter?.name || 'Bộ lọc';
  return `<${tag} class="filtered-block"${anchorId ? ` id="${esc(anchorId)}"` : ''}>
    <button type="button" class="filtered-reveal" aria-expanded="false">
      ${ICON_EYE_OFF}<span class="filtered-reveal-off">Đã ẩn ${noun} bởi bộ lọc “${esc(reason)}” — Chạm để hiện</span><span class="filtered-reveal-on" hidden>${ICON_EYE_ON} Đang hiển ${noun} — chạm để ẩn lại</span>
    </button>
    <div class="filtered-content" hidden>${contentHtml}</div>
  </${tag}>`;
}

// Thread list rows with 'threads' filters; rowOpts forwards to threadRow.
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

// Post list with 'posts' filters; renderPost defaults to postHtml.
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
    // Anchor stays on the wrapper for #post-N permalinks; inner id renamed to avoid duplicates.
    const rawId = Number(post?.post_id || post?.message_id || 0);
    const anchorId = kind === 'conversation' ? `conversation-message-${rawId}` : `post-${rawId}`;
    const noun = kind === 'conversation' ? 'tin nhắn' : 'bài viết';
    const inner = render(item, { id: `filtered-${anchorId}` });
    return hiddenBlock(inner, filter, { noun, anchorId: rawId ? anchorId : '', tag: 'div' });
  }).join('');
}

// Reveal a filtered block; used by the reveal button and permalink helpers.
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

// Delegated reveal clicks plus hashchange so #post-N links re-open hidden posts.
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
