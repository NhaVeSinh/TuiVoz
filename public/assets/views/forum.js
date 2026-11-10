// Forum index (node tree) and the thread list of one forum.

import { app, state } from '../core/dom.js';
import { esc, num } from '../core/utils.js';
import { forumPath, searchForumPath, slugify, withPage } from '../core/paths.js';
import { api } from '../api.js';
import { setActiveNav, setBreadcrumbs } from '../ui/chrome.js';
import { setTitle, setBrandTitle } from '../ui/title.js';
import { loading, errorBox } from '../ui/feedback.js';
import { pagination, wirePageJump, wireScrollArm } from '../ui/pagination.js';
import { threadRow } from '../ui/threadRow.js';
import { nodeTree, subForumBlock } from '../ui/forumNodes.js';
import { mountInfiniteScroll } from '../ui/infiniteScroll.js';

export async function viewHome() {
  setActiveNav('home');
  setBrandTitle();
  setBreadcrumbs([{ label: 'Diễn đàn' }]);
  loading();
  try {
    if (!state.nodes) state.nodes = await api.nodes();
    const { nodes, tree_map: treeMap } = state.nodes;
    app.innerHTML = nodeTree(nodes, treeMap);
  } catch (err) {
    app.innerHTML = errorBox(err);
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
      state.nodes ? Promise.resolve(state.nodes) : api.nodes(),
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
          ${sticky.length ? `<div class="structItemContainer-group structItemContainer-group--sticky">${sticky.map((t) => threadRow(t, { sticky: true })).join('')}</div>` : ''}
          <div class="structItemContainer-group">${threads.map((t) => threadRow(t)).join('')}</div>
        </div>
      </div>
      <div class="block-outer" id="pager-slot">${pagination(threadsRes.pagination, (p) => withPage(forumPath(forum), p))}</div>`;
    const href = (p) => withPage(forumPath(forum), p);
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
  group.insertAdjacentHTML('beforeend', threads.map((t) => threadRow(t)).join(''));
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
          ${sticky.length ? `<div class="structItemContainer-group structItemContainer-group--sticky">${sticky.map((t) => threadRow(t, { sticky: true, showForum: true })).join('')}</div>` : ''}
          <div class="structItemContainer-group">${normal.map((t) => threadRow(t, { showForum: true })).join('')}</div>
        </div>
      </div>
      <div class="block-outer" id="pager-slot">${pagination(threadsRes.pagination, (p) => withPage(searchForumPath(node), p))}</div>`;
    const href = (p) => withPage(searchForumPath(node), p);
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
        group.insertAdjacentHTML('beforeend', rows.map((t) => threadRow(t, { showForum: true })).join(''));
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
          <div class="structItemContainer-group">${threads.map((t) => threadRow(t, { showForum: true })).join('')}</div>
        </div>
        ${pagination(res.pagination, (p) => withPage('/new', p))}
      </div>`;
    wirePageJump((p) => withPage('/new', p));
  } catch (err) {
    app.innerHTML = errorBox(err);
  }
}
