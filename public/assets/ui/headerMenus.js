/** Header menus. */
import { state } from '../core/dom.js';
import { esc, timeAgo } from '../core/utils.js';
import { dmPath, userPath } from '../core/paths.js';
import { navigate } from '../core/nav.js';
import { api } from '../api.js';
import { avatarMarkup } from '../lib/avatar.js';
import { alertTextMarkup } from './alertMarkup.js';
import { refreshUnreadCounts, wireUnreadCounts } from './unreadCounts.js';

export function closeHeaderMenus() {
  document.querySelectorAll('.header-menu').forEach((menu) => {
    menu.hidden = true;
    document.querySelector(`[aria-controls="${menu.id}"]`)?.setAttribute('aria-expanded', 'false');
  });
}

export function wireHeaderMenus() {
  wireUnreadCounts();
  document.addEventListener('click', async (event) => {
    const toggle = event.target.closest('[data-header-menu]');
    if (!toggle) {
      if (!event.target.closest('.header-menu') || event.target.closest('a')) closeHeaderMenus();
      return;
    }
    const menu = document.getElementById(toggle.getAttribute('aria-controls'));
    const opening = menu.hidden;
    closeHeaderMenus();
    if (!opening) return;
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    menu.querySelector('input, a, button')?.focus();
    const kind = toggle.dataset.headerMenu;
    if (!['alerts', 'dm'].includes(kind)) return;
    const body = menu.querySelector('.header-menu-body');
    if (!state.loggedIn) {
      body.innerHTML = '<div class="menu-empty"><a href="/login">Đăng nhập để xem</a></div>';
      return;
    }
    body.innerHTML = '<div class="menu-empty">Đang tải…</div>';
    try {
      const res = await (kind === 'dm' ? api.conversations() : api.alerts());
      if (!body.isConnected) return;
      const items = (kind === 'dm' ? res.conversations : res.alerts) || [];
      const visibleItems = items.slice(0, 6);
      body.innerHTML = (await Promise.all(visibleItems.map(async (item) => {
        const user = item.Starter || item.User || { user_id: item.user_id, username: item.username };
        const alertHref = item.content_type === 'post' && item.content_id
          ? `/p/${Number(item.content_id)}/`
          : item.alert_url ? item.alert_url.replace(/^https?:\/\/voz\.vn/, '') : userPath(user);
        const title = kind === 'dm'
          ? `<a href="${dmPath(item)}">${esc(item.title)}</a>`
          : `<a href="${alertHref}">${await alertTextMarkup(item)}</a>`;
        const unread = kind === 'dm' ? item.is_unread : !item.view_date;
        return `<div class="menu-preview${unread ? ' is-unread' : ''}"><a class="avatar" href="${userPath(user)}">${avatarMarkup(user, 's')}</a><div>${title}<div class="u-dimmed u-smaller">${esc(user.username || '')} · ${timeAgo(item.last_message_date || item.event_date)}</div></div></div>`;
      }))).join('') || '<div class="menu-empty">Chưa có mục nào.</div>';
      try {
        if (kind === 'alerts') {
          await api.markAlertsViewed();
        } else {
          await Promise.all(visibleItems.filter((item) => item.is_unread).map((item) =>
            api.markConversationRead(item.conversation_id, item.last_message_date)));
        }
      } catch {
        if (body.isConnected) body.insertAdjacentHTML('beforeend', '<div class="menu-empty">Không đánh dấu đã xem được. Hãy mở lại menu để thử lại.</div>');
      }
    } catch (err) {
      body.textContent = err.message;
    } finally {
      refreshUnreadCounts(true);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const toggle = document.querySelector('[data-header-menu][aria-expanded="true"]');
    closeHeaderMenus();
    toggle?.focus();
  });
  window.addEventListener('popstate', closeHeaderMenus);
  document.addEventListener('submit', (event) => {
      if (event.target.id !== 'header-search') return;
      event.preventDefault();
    const data = new FormData(event.target);
    const q = String(data.get('q') || '').trim();
    const member = String(data.get('member') || '').trim();
    if (!q && !member) return;
    closeHeaderMenus();
    navigate(`/search?${new URLSearchParams({ q, member })}`);
  });
}
