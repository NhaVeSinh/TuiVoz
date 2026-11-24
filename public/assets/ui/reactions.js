/** Reactions. */

import { state } from '../core/dom.js';
import { esc } from '../core/utils.js';
import { userPath } from '../core/paths.js';
import { isDataSaving } from '../lib/dataSaving.js';
import { getReactorNames } from '../lib/settings.js';
import { openModal } from './modal.js';
import { avatarMarkup } from '../lib/avatar.js';
import { wireMemberTooltips } from './memberTooltip.js';

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
    // voz rows carry the member's real avatar img; grab it for the modal.
    const avatarImg = row.querySelector('img.avatar, .avatar img, img[src*="avatars"]');
    rows.push({
      userId: Number(user.getAttribute('data-user-id')),
      username: user.textContent.trim(),
      reactionId: reaction ? Number(reaction.getAttribute('data-reaction-id')) : null,
      reactionTitle: img ? img.getAttribute('alt') : null,
      avatarUrl: avatarImg ? avatarImg.getAttribute('src') || '' : '',
    });
  }
  return rows;
}

async function loadReactionUsers(postId) {
  if (reactionUsersCache.has(postId)) return reactionUsersCache.get(postId);
  // Via /forum proxy: same-origin, works where voz.vn is DNS-blocked.
  const promise = fetch(`/forum/p/${postId}/reactions`)
    .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then(parseReactionUsers)
    .catch(() => []);
  reactionUsersCache.set(postId, promise);
  return promise;
}

// Names cost one /p/:id/reactions scrape per post; data-saving OR the
// reactorNames-off default show icons+count, full list opens on tap.
const namesEager = () => !isDataSaving() && getReactorNames();

export function reactionSummary(post) {
  const counts = post.reaction_counts || {};
  const total = Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0);
  if (!total) return '';
  if (!namesEager()) {
    return `<div class="reactionsBar" data-reaction-list="${post.post_id}" title="Bấm để xem ai đã thả cảm xúc">
      <span class="reactionsBar-icons">${countIcons(counts)}</span>
      <span class="reactionsBar-users">${total}</span>
    </div>`;
  }
  return `<div class="reactionsBar" data-reaction-list="${post.post_id}">
    <span class="reactionsBar-loading">Đang tải thành viên…</span>
  </div>`;
}

function countIcons(counts) {
  const catalogue = state.reactions || [];
  return catalogue
    .filter((r) => (Number(counts[String(r.reaction_id)]) || 0) > 0)
    .map((r) => `<img src="${esc(r.image_url)}" alt="${esc(r.title)}" title="${esc(r.title)}" referrerpolicy="no-referrer" class="reaction-image">`)
    .join('');
}

// Tapping the strip (not a name link) opens the full reactor list, like voz.
// With names-eager on (reactorNames + no data-saving), tap opens the modal;
// otherwise the first tap fills names, the second opens it.
document.addEventListener('click', async (event) => {
  const strip = event.target.closest('.reactionsBar[data-reaction-list]');
  if (!strip || event.target.closest('a')) return;
  if (namesEager()) {
    openReactionUsersModal(strip);
    return;
  }
  if (!strip.dataset.namesLoaded) {
    strip.dataset.namesLoaded = 'true';
    await fillReactionStrip(strip);
    return;
  }
  openReactionUsersModal(strip);
});

export async function hydrateReactionLists(root) {
  if (!namesEager()) return; // strips already show icons+count; tap loads names
  // Names are a cross-origin scrape per post; defer each strip until near the viewport.
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
    // Fill the strip before it scrolls into view.
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
  const more = users.length > shown.length ? `<span class="reactionsBar-more"> và ${users.length - shown.length} người khác</span>` : '';
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

// Full reactor list modal, mirroring voz.vn's overlay.
async function openReactionUsersModal(strip) {
  const postId = strip.dataset.reactionList;
  const { close } = openModal('Người đã bày tỏ cảm xúc', '<p class="reactionsBar-loading">Đang tải thành viên…</p>', '', { className: 'modal--reactors' });
  const users = await loadReactionUsers(postId);
  const body = modalBody();
  if (!body) return; // user closed before the fetch resolved
  if (!users.length) {
    body.innerHTML = '<p class="reactionsBar-loading">Chưa có ai bày tỏ cảm xúc.</p>';
    return;
  }
  const catalogue = state.reactions || [];
  const byId = new Map(catalogue.map((r) => [r.reaction_id, r]));
  const stubs = users.map((u) => ({
    user_id: u.userId,
    username: u.username,
    avatar_urls: u.avatarUrl ? { m: u.avatarUrl, s: u.avatarUrl } : {},
  }));
  body.innerHTML = `<ul class="reactor-list">${users.map((u, i) => {
    const r = u.reactionId ? byId.get(u.reactionId) : null;
    const icon = r ? `<img src="${esc(r.image_url)}" alt="${esc(r.title)}" title="${esc(r.title)}" referrerpolicy="no-referrer" class="reaction-image">` : '';
    return `<li><span class="avatar avatar--xs reactor-list-avatar">${avatarMarkup(stubs[i], 'm')}</span><a class="reactor-list-user" data-member-id="${u.userId}" href="${userPath({ user_id: u.userId, username: u.username })}">${esc(u.username)}</a>${icon}</li>`;
  }).join('')}</ul>`;
  // Hover card on desktop; tap toggles it on mobile (same as elsewhere).
  wireMemberTooltips(body, stubs);
  // Name links inside the modal navigate in-app; close first.
  body.addEventListener('click', (event) => {
    if (event.target.closest('a')) close();
  });
}

function modalBody() {
  return document.querySelector('.modal--reactors .modal-body');
}

// Screenshot clones stay off-screen so strips never resolve there (no CORS either); drop unresolved ones.
export function pruneUnloadedReactionStrips(root) {
  for (const strip of root.querySelectorAll('.reactionsBar[data-reaction-list]')) {
    if (!strip.querySelector('.reactionsBar-users')) strip.remove();
  }
}
