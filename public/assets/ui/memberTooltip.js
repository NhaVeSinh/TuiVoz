import { esc, timeAgo } from '../core/utils.js';
import { userPath } from '../core/paths.js';
import { avatarMarkup } from '../lib/avatar.js';
import { api } from '../api.js';
import { userBadges } from '../lib/userBadges.js';

const cache = new Map();
let active;
let timer;
let card;

function hide() {
  clearTimeout(timer);
  active?.removeAttribute('aria-describedby');
  active = null;
  card?.remove();
  card = null;
}

export function wireMemberTooltips(container, users) {
  hide();
  const byId = new Map(users.filter(Boolean).map((user) => [String(user.user_id), user]));
  const scheduleHide = () => {
    if (matchMedia('(max-width: 620px), (hover: none)').matches) return;
    clearTimeout(timer);
    timer = setTimeout(hide, 180);
  };
  const show = async (link) => {
    hide();
    active = link;
    card = document.createElement('section');
    card.className = 'member-card';
    card.id = 'member-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Thông tin thành viên');
    link.setAttribute('aria-describedby', card.id);
    document.body.append(card);
    card.addEventListener('mouseenter', () => clearTimeout(timer));
    card.addEventListener('mouseleave', scheduleHide);
    card.addEventListener('focusin', () => clearTimeout(timer));
    card.addEventListener('focusout', scheduleHide);
    const render = (user) => {
      if (active !== link || !card) return;
      // The member card always prints full figures, so it needs no scope.
      const count = (value) => Number(value || 0).toLocaleString('vi-VN');
      card.innerHTML = `<div class="member-card-header"><a class="avatar" href="${userPath(user)}">${avatarMarkup(user, 'l')}</a><div><a class="member-card-name" href="${userPath(user)}">${esc(user.username)}</a><div>${esc(user.user_title || '')}</div><div class="member-card-badges">${userBadges(user)}</div><div class="u-dimmed u-smaller">Tham gia: ${user.register_date ? new Date(user.register_date * 1000).toLocaleDateString('vi-VN') : '—'}</div>${user.last_activity ? `<div class="u-dimmed u-smaller">Hoạt động: ${timeAgo(user.last_activity, 'thread')}</div>` : ''}</div></div><div class="member-card-stats"><div>Bài viết<strong>${count(user.message_count)}</strong></div><div>Điểm cảm xúc<strong>${count(user.reaction_score)}</strong></div><div>Điểm<strong>${count(user.trophy_points)}</strong></div></div><div class="member-card-actions"><a href="${userPath(user)}">Hồ sơ</a>${user.can_converse ? `<a class="button button--small" href="/direct-messages/new?to=${encodeURIComponent(user.username)}">Gửi tin nhắn</a>` : ''}</div>`;
      const rect = link.getBoundingClientRect();
      const width = card.getBoundingClientRect().width;
      card.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - width - 8))}px`;
      const height = card.getBoundingClientRect().height;
      const below = innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const placeBelow = below >= height || below >= above;
      card.style.maxHeight = `${Math.max(80, placeBelow ? below : above)}px`;
      card.style.top = `${placeBelow ? rect.bottom + 8 : Math.max(8, rect.top - Math.min(height, above) - 8)}px`;
    };
    const id = link.dataset.memberId;
    render(byId.get(id) || { user_id: Number(id), username: link.textContent });
    try {
      if (!cache.has(id)) cache.set(id, api.user(id).then((res) => res.user).catch((err) => { cache.delete(id); throw err; }));
      render(await cache.get(id));
    } catch { /* Keep the public details already included with the post. */ }
  };
  for (const link of container.querySelectorAll('[data-member-id]')) {
    const start = () => {
      if (matchMedia('(max-width: 620px), (hover: none)').matches) return;
      clearTimeout(timer);
      timer = setTimeout(() => show(link), 300);
    };
    link.addEventListener('click', (event) => {
      if (!matchMedia('(max-width: 620px), (hover: none)').matches) return;
      event.preventDefault();
      event.stopPropagation();
      if (active === link && card) hide();
      else show(link);
    });
    link.addEventListener('mouseenter', start);
    link.addEventListener('mouseleave', scheduleHide);
    link.addEventListener('focus', start);
    link.addEventListener('blur', scheduleHide);
  }
}

document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hide(); });
document.addEventListener('click', (event) => { if (!event.target.closest('.member-card')) hide(); });
window.addEventListener('scroll', () => { if (card) hide(); }, { passive: true });
window.addEventListener('popstate', hide);
window.addEventListener('resize', hide);
new MutationObserver(() => { if (active && !active.isConnected) hide(); }).observe(document.getElementById('app'), { childList: true });
