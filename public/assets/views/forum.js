// Forum index (node tree) and the thread list of one forum.

import { app, state } from '../core/dom.js';
import { esc, num } from '../core/utils.js';
import { forumPath, searchForumPath, slugify, withPage } from '../core/paths.js';
import { api } from '../api.js';
import { setActiveNav, setBreadcrumbs } from '../ui/chrome.js';
import { setTitle, setBrandTitle } from '../ui/title.js';
import { loading, errorBox } from '../ui/feedback.js';
import { pagination, wirePageJump, wireScrollArm } from '../ui/pagination.js';
import { wireThreadRowBans } from '../ui/threadRow.js';
import { threadEntriesHtml } from '../filters/apply.js';
import { nodeTree, subForumBlock } from '../ui/forumNodes.js';
import { mountInfiniteScroll } from '../ui/infiniteScroll.js';
import { cachedCatalog, readCatalog, storeCatalog, catalogAge } from '../lib/catalogs.js';

// How stale the home tree may be before a background revalidation spends bytes. News-type feeds go stale
// "after a couple of hours" (Verachtert et al. 2023, ScienceDirect) — 15 minutes sits far inside that bound,
// costs ~2 fetches per half-hour session instead of one per Home visit, and matches the reader's own ask.
const NODES_REVALIDATE_MS = 15 * 60 * 1000;

// The node tree carries each forum's latest-thread line — the reader's quick news peek — so it paints
// instantly from the cached copy and then revalidates in the background: when the fresh /nodes/ payload
// differs, the tree re-renders (only while the reader is still on the home route). A stale-while-revalidate
// home instead of the old always-fresh fetch: instant paint with no 100KB+ wait, and no hour-old lines.
export async function viewHome() {
  setActiveNav('home');
  setBrandTitle();
  setBreadcrumbs([{ label: 'Diễn đàn' }]);
  const cached = readCatalog('nodes');
  if (!cached) loading();
  const paint = (nodesRes) => {
    app.innerHTML = nodeTree(nodesRes.nodes, nodesRes.tree_map);
  };
  try {
    if (cached) {
      state.nodes = cached;
      paint(cached);
    }
    // Fresh enough: the painted tree stays as-is and no bytes are spent on this visit.
    const age = catalogAge('nodes');
    if (cached && age !== null && age < NODES_REVALIDATE_MS) return;
    const fresh = await api.nodes().catch(() => null);
    if (fresh) {
      const changed = !state.nodes || JSON.stringify(fresh) !== JSON.stringify(state.nodes);
      storeCatalog('nodes', fresh);
      state.nodes = fresh;
      if ((!cached || changed) && location.pathname === '/') paint(fresh);
    }
    if (!state.nodes) throw new Error('Không tải được danh sách diễn đàn');
  } catch (err) {
    // A background failure must not clobber the already-painted cached tree.
    if (!state.nodes) app.innerHTML = errorBox(err);
  }
}

export async function viewForum(nodeId, page) {
  setActiveNav('home');
  loading();
  try {
    // /forums/{id} has no child nodes, so the node tree supplies the sub-forum block. Both calls run in
    // parallel; the node tree is cached after the first fetch.
    const [forumRes, threadsRes, nodesRes] = await Promise.all([
      api.forum(nodeId),
      api.forumThreads(nodeId, page),
      state.nodes ? Promise.resolve(state.nodes) : cachedCatalog('nodes', () => api.nodes()),
    ]);
    if (!state.nodes) state.nodes = nodesRes;
    const forum = forumRes.forum;
    const crumbs = (forum.breadcrumbs || []).map((b) => ({
      label: b.title,
      ...(b.node_id ? { href: `/#${slugify(b.title)}.${b.node_id}` } : {}),
    }));
    setBreadcrumbs([{ label: 'Diễn đàn', href: '/' }, ...crumbs, { label: forum.title }], {
      href: `${forumPath(forum)}post-thread`, label: 'Tạo chủ đề mới',
    });
    setTitle(forum.title, page);

    const sticky = threadsRes.sticky || [];
    const threads = threadsRes.threads || [];
    const subForums = subForumBlock(nodesRes.nodes || [], nodesRes.tree_map || {}, nodeId);

    app.innerHTML = `
      ${subForums}
      <div class="block">
        <div class="block-header">
          ${esc(forum.title)}
          <span class="block-header-extra">${num(threadsRes.pagination && threadsRes.pagination.total)} chủ đề</span>
        </div>
        <div class="structItemContainer" id="thread-rows">
          ${sticky.length ? `<div class="structItemContainer-group structItemContainer-group--sticky">${threadEntriesHtml(sticky, { sticky: true })}</div>` : ''}
          <div class="structItemContainer-group">${threadEntriesHtml(threads)}</div>
        </div>
      </div>
      <div class="block-outer" id="pager-slot">${pagination(threadsRes.pagination, (p) => withPage(forumPath(forum), p))}</div>`;
    const href = (p) => withPage(forumPath(forum), p);
    wireThreadRowBans(document.getElementById('thread-rows'), [...sticky, ...threads]);
    wirePageJump(href);
    wireScrollArm();
    mountInfiniteScroll({
      makeHref: href,
      currentPage: threadsRes.pagination?.current_page || 1,
      lastPage: threadsRes.pagination?.last_page || 1,
      after: document.getElementById('pager-slot'),
      fetchPage: (p) => api.forumThreads(nodeId, p),
      insert: (p, res) => appendThreadRows('thread-rows', res.threads || []),
    });
  } catch (err) {
    app.innerHTML = errorBox(err);
  }
}

// Appends one more page of rows; sticky rows only appear on page 1.
function appendThreadRows(containerId, threads) {
  const container = document.getElementById(containerId);
  if (!container || !threads.length) return 0;
  const group = container.querySelector('.structItemContainer-group:not(.structItemContainer-group--sticky)');
  if (!group) return 0;
  group.insertAdjacentHTML('beforeend', threadEntriesHtml(threads));
  wireThreadRowBans(group, threads);
  return threads.length;
}

// Aggregated node: threads come from many forums, so the forum name belongs in each row's meta, like voz.vn's
// /s/<slug>.<id>/page-<n>.
export async function viewSearchForum(nodeId, page) {
  setActiveNav('home');
  loading();
  try {
    const [nodeRes, threadsRes] = await Promise.all([api.searchForum(nodeId), api.searchForumThreads(nodeId, page)]);
    const node = nodeRes.search_forum;
    const crumbs = (node.breadcrumbs || []).map((b) => ({ label: b.title }));
    setBreadcrumbs([{ label: 'Diễn đàn', href: '/' }, ...crumbs, { label: node.title }], {
      href: 'https://voz.vn/f/-/post-thread', label: 'Tạo chủ đề mới',
    });
    setTitle(node.title, page);

    const threads = threadsRes.threads || [];
    const sticky = threads.filter((t) => t.sticky);
    const normal = threads.filter((t) => !t.sticky);

    app.innerHTML = `
      <div class="block">
        <div class="block-header">
          ${esc(node.title)}
          <span class="block-header-extra">${num(threadsRes.pagination && threadsRes.pagination.total)} chủ đề</span>
        </div>
        <div class="structItemContainer" id="thread-rows">
          ${sticky.length ? `<div class="structItemContainer-group structItemContainer-group--sticky">${threadEntriesHtml(sticky, { sticky: true, showForum: true })}</div>` : ''}
          <div class="structItemContainer-group">${threadEntriesHtml(normal, { showForum: true })}</div>
        </div>
      </div>
      <div class="block-outer" id="pager-slot">${pagination(threadsRes.pagination, (p) => withPage(searchForumPath(node), p))}</div>`;
    const href = (p) => withPage(searchForumPath(node), p);
    wireThreadRowBans(document.getElementById('thread-rows'), threads);
    wirePageJump(href);
    wireScrollArm();
    mountInfiniteScroll({
      makeHref: href,
      currentPage: threadsRes.pagination?.current_page || 1,
      lastPage: threadsRes.pagination?.last_page || 1,
      after: document.getElementById('pager-slot'),
      fetchPage: (p) => api.searchForumThreads(nodeId, p),
      insert: (p, res) => {
        const container = document.getElementById('thread-rows');
        const group = container?.querySelector('.structItemContainer-group:not(.structItemContainer-group--sticky)');
        const rows = (res.threads || []).filter((t) => !t.sticky);
        if (!group || !rows.length) return 0;
        group.insertAdjacentHTML('beforeend', threadEntriesHtml(rows, { showForum: true }));
        wireThreadRowBans(group, rows);
        return rows.length;
      },
    });
  } catch (err) {
    app.innerHTML = errorBox(err);
  }
}

export async function viewNewThreads(page) {
  setActiveNav('new');
  setBreadcrumbs([{ label: 'Diễn đàn', href: '/' }, { label: 'Bài mới' }]);
  setTitle("What's new", page);
  loading();
  try {
    const res = await api.threads(page, 'post_date');
    const threads = res.threads || [];
    app.innerHTML = `
      <div class="block">
        <div class="block-header">Bài mới<span class="block-header-extra">${num(res.pagination && res.pagination.total)} chủ đề</span></div>
        <div class="structItemContainer">
          <div class="structItemContainer-group">${threadEntriesHtml(threads, { showForum: true })}</div>
        </div>
        ${pagination(res.pagination, (p) => withPage('/new', p))}
      </div>`;
    wireThreadRowBans(document.querySelector('.structItemContainer'), threads);
    wirePageJump((p) => withPage('/new', p));
  } catch (err) {
    app.innerHTML = errorBox(err);
  }
}
