// Reaction buttons and the "who reacted" strip. The member list is not in the REST API: it is scraped from
// /p/{id}/reactions, which only the browser can reach.

import { state } from '../core/dom.js';
import { esc } from '../core/utils.js';
import { userPath } from '../core/paths.js';

export function reactionBar(post) {
  const counts = post.reaction_counts || {};
  const mine = post.visitor_reaction_id;
  const catalogue = state.reactions || [];

  return catalogue
    .filter((r) => r.active || counts[String(r.reaction_id)])
    .map((r) => {
      const count = Number(counts[String(r.reaction_id)]) || 0;
      const active = mine === r.reaction_id ? ' has-reaction' : '';
      return `<a href="#" class="reaction reaction--small actionBar-action${active}" data-react="${r.reaction_id}" data-post="${post.post_id}"
        title="${esc(r.title)}" ${post.can_react ? '' : 'aria-disabled="true"'}>
        <img src="${esc(r.image_url)}" alt="${esc(r.title)}" referrerpolicy="no-referrer" class="reaction-image">
        <span class="reaction-text">${esc(r.title)}</span>
        ${count ? `<span class="reaction-count">${count}</span>` : ''}
      </a>`;
    })
    .join('');
}

const reactionUsersCache = new Map();

export function invalidateReactionUsers(postId) {
  reactionUsersCache.delete(String(postId));
}

function parseReactionUsers(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = [];
  for (const row of doc.querySelectorAll('.block-row--separated')) {
    const user = row.querySelector('.username[data-user-id]');
    if (!user) continue;
    const reaction = row.querySelector('.reaction[data-reaction-id]');
    const img = row.querySelector('.reaction-image');
    rows.push({
      userId: Number(user.getAttribute('data-user-id')),
      username: user.textContent.trim(),
      reactionId: reaction ? Number(reaction.getAttribute('data-reaction-id')) : null,
      reactionTitle: img ? img.getAttribute('alt') : null,
    });
  }
  return rows;
}

async function loadReactionUsers(postId) {
  if (reactionUsersCache.has(postId)) return reactionUsersCache.get(postId);
  const promise = fetch(`https://voz.vn/p/${postId}/reactions`, { credentials: 'omit' })
    .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then(parseReactionUsers)
    .catch(() => []);
  reactionUsersCache.set(postId, promise);
  return promise;
}

export function reactionSummary(post) {
  const counts = post.reaction_counts || {};
  const total = Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0);
  if (!total) return '';
  return `<div class="reactionsBar" data-reaction-list="${post.post_id}">
    <span class="reactionsBar-loading">Đang tải thành viên…</span>
  </div>`;
}

export async function hydrateReactionLists(root) {
  // The member list is a cross-origin scrape per post, so a page of 20 posts would fire 20 requests right after
  // render. Each strip waits until it is near the viewport, keeping the numbers in `reaction_counts` immediate.
  for (const strip of root.querySelectorAll('.reactionsBar[data-reaction-list]')) {
    if (strip.dataset.reactionWired) continue;
    strip.dataset.reactionWired = 'true';
    observeReactionStrip(strip);
  }
}

let stripObserver = null;

function observeReactionStrip(strip) {
  if (!('IntersectionObserver' in window)) {
    fillReactionStrip(strip);
    return;
  }
  stripObserver ||= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        stripObserver.unobserve(entry.target);
        fillReactionStrip(entry.target);
      }
    },
    // Start early enough that the strip is filled before it scrolls into view.
    { rootMargin: '400px 0px' }
  );
  stripObserver.observe(strip);
}

async function fillReactionStrip(strip) {
  const postId = strip.dataset.reactionList;
  const users = await loadReactionUsers(postId);
  if (!strip.isConnected) return;
  if (!users.length) {
    strip.remove();
    return;
  }
  const catalogue = state.reactions || [];
  const byId = new Map(catalogue.map((r) => [r.reaction_id, r]));
  const shown = users.slice(0, 6);
  const names = shown
    .map((u) => `<a href="${userPath({ user_id: u.userId, username: u.username })}" class="reactionsBar-user">${esc(u.username)}</a>`)
    .join(', ');
  const more = users.length > shown.length ? ` và ${users.length - shown.length} người khác` : '';
  const icons = [...new Set(users.map((u) => u.reactionId))]
    .filter(Boolean)
    .map((id) => {
      const r = byId.get(id);
      if (!r) return '';
      return `<img src="${esc(r.image_url)}" alt="${esc(r.title)}" title="${esc(r.title)}" referrerpolicy="no-referrer" class="reaction-image">`;
    })
    .join('');
  strip.innerHTML = `<span class="reactionsBar-icons">${icons}</span>
    <span class="reactionsBar-users">${names}${more}</span>`;
}

// A screenshot clone is parked off-screen, so the visibility observer never fires inside it and the
// "Đang tải thành viên…" placeholder would be baked into the PNG. Strips that already resolved keep their list;
// the rest are dropped. No request is made — voz.vn sends no CORS header on /p/{id}/reactions, so fetching from
// here can only fail and would still leave the placeholder.
export function pruneUnloadedReactionStrips(root) {
  for (const strip of root.querySelectorAll('.reactionsBar[data-reaction-list]')) {
    if (!strip.querySelector('.reactionsBar-users')) strip.remove();
  }
}
