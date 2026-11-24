/** Forum views. */

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

// Home tree staleness bound: 15 min, well inside typical feed freshness.
const NODES_REVALIDATE_MS = 15 * 60 * 1000;

// Stale-while-revalidate home: paint cached tree instantly, refresh in background.
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
    // Skip refetch when cache is fresh.
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
    // Don't clobber the painted cached tree on background failure.
    if (!state.nodes) app.innerHTML = errorBox(err);
  }
}

export async function viewForum(nodeId, page) {
  setActiveNav('home');
  loading();
  try {
    // Sub-forum block comes from the (cached) node tree, not /forums/{id}.
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

// Sticky rows appear on page 1 only.
function appendThreadRows(containerId, threads) {
  const container = document.getElementById(containerId);
  if (!container || !threads.length) return 0;
  const group = container.querySelector('.structItemContainer-group:not(.structItemContainer-group--sticky)');
  if (!group) return 0;
  group.insertAdjacentHTML('beforeend', threadEntriesHtml(threads));
  wireThreadRowBans(group, threads);
  return threads.length;
}

// Aggregated node: rows show forum names, like voz.vn's /s/… page.
export async function viewSearchForum(nodeId, page) {
  setActiveNav('home');
  loading();
  try {
    const [nodeRes, threadsRes] = await Promise.all([api.searchForum(nodeId), api.searchForumThreads(nodeId, page)]);
    const node = nodeRes.search_forum;
    const crumbs = (node.breadcrumbs || []).map((b) => ({ label: b.title }));
    setBreadcrumbs([{ label: 'Diễn đàn', href: '/' }, ...crumbs, { label: node.title }], {
      href: '/forum/f/-/post-thread', label: 'Tạo chủ đề mới',
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
