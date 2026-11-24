/** Header + nav chrome. */

import { accountEl, breadcrumbsEl, navEl, state } from '../core/dom.js';
import { esc } from '../core/utils.js';
import { userPath } from '../core/paths.js';
import { navigate } from '../core/nav.js';
import { avatarMarkup } from '../lib/avatar.js';
import { loadSettings } from '../lib/settings.js';
import { auth } from '../api.js';
import { toast } from './feedback.js';
import { refreshUnreadCounts } from './unreadCounts.js';
import { ICON_SEARCH, ICON_MAIL, ICON_BELL, ICON_POWER, ICON_EDIT } from '../core/icons.js';

const menuButton = (kind, label, icon, content) => `<div class="header-menu-wrap"><button class="header-icon" type="button" data-header-menu="${kind}" aria-label="${label}" title="${label}" aria-expanded="false" aria-controls="header-menu-${kind}">${icon}</button><section class="header-menu" id="header-menu-${kind}" aria-label="${label}" hidden><h2>${label}</h2>${content}</section></div>`;

// Shortcuts render next to "Bài mới" in saved order.
export function renderNavShortcuts() {
  if (!navEl) return;
  for (const item of navEl.querySelectorAll('[data-shortcut-id]')) item.remove();
  const { navShortcuts } = loadSettings();
  const fragment = document.createDocumentFragment();
  for (const shortcut of navShortcuts) {
    const li = document.createElement('li');
    li.dataset.shortcutId = shortcut.id;
    const link = document.createElement('a');
    link.href = shortcut.url;
    link.textContent = shortcut.name;
    link.title = `${shortcut.name} — ${shortcut.url}`;
    li.append(link);
    fragment.append(li);
  }
  navEl.append(fragment);
}

// Wired once at boot so cross-tab settings changes apply immediately.
export function wireNavShortcuts() {
  renderNavShortcuts();
  window.addEventListener('voz:settings', renderNavShortcuts);
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === 'voz-settings:v1') renderNavShortcuts();
  });
}

function utilityMenus() {
  return menuButton('dm', 'Hộp thư', ICON_MAIL, '<div class="header-menu-body"></div><a class="menu-footer" href="/direct-messages">Xem tất cả hộp thư</a>') +
    menuButton('alerts', 'Thông báo', ICON_BELL, '<div class="header-menu-body"></div><a class="menu-footer" href="/alerts">Xem tất cả thông báo</a>') +
    menuButton('search', 'Tìm kiếm', ICON_SEARCH, `<form id="header-search" class="quick-search"><input class="input" type="search" name="q" placeholder="Từ khoá…" aria-label="Từ khoá"><input class="input" name="member" placeholder="Bởi: tên thành viên" aria-label="Bởi thành viên"><small class="u-dimmed">Nhập từ khoá hoặc thành viên. Kết hợp bộ lọc: dùng tìm nâng cao.</small><button class="button button--primary" type="submit">Tìm kiếm</button><a href="https://voz.vn/search/" target="_blank" rel="noopener">Tìm kiếm nâng cao…</a><a href="/search">Trang tìm kiếm</a></form>`);
}

export function renderAccount() {
  if (state.loggedIn && state.me) {
    const me = state.me;
    accountEl.innerHTML = `
      <div class="header-menu-wrap"><button class="account-toggle header-icon" type="button" data-header-menu="account" aria-expanded="false" aria-controls="header-menu-account"><span class="avatar">${avatarMarkup(me, 's')}</span><span class="username">${esc(me.username)}</span></button><section class="header-menu account-menu" id="header-menu-account" aria-label="Tài khoản" hidden><h2>${esc(me.username)}</h2><a href="${userPath(me)}">Hồ sơ</a><a href="/bookmarks">Đánh dấu</a>      <a href="/watched">Theo dõi</a><a href="/cai-dat-tuivoz">Cài đặt</a><button class="account-logout" id="logout-btn" type="button">${ICON_POWER} Đăng xuất</button></section></div>
            ${utilityMenus()}
    `;
    refreshUnreadCounts();
    const btn = document.getElementById('logout-btn');
    if (btn) {
      btn.addEventListener('click', async () => {
        await auth.logout();
        state.loggedIn = false;
        state.me = null;
        renderAccount();
        toast('Đã đăng xuất');
        navigate('/');
      });
    }
  } else {
    accountEl.innerHTML = `<a class="button button--small button--primary" href="/login">Đăng nhập</a>${utilityMenus()}`;
  }
}

export function setBreadcrumbs(items, action) {
  if (!items || !items.length) {
    breadcrumbsEl.innerHTML = '';
    return;
  }
  breadcrumbsEl.innerHTML = items
    .map((item, index) => {
      const label = esc(item.label);
      const node = item.href ? `<a href="${esc(item.href)}">${label}</a>` : `<span>${label}</span>`;
      return index ? `<span class="sep">›</span>${node}` : node;
    })
    .join('');
  if (action) {
    const external = action.href && !action.href.startsWith('/');
    const extra = external ? ' target="_blank" rel="noopener"' : '';
    breadcrumbsEl.innerHTML = `<div class="breadcrumb-trail">${breadcrumbsEl.innerHTML}</div><a class="button button--cta" href="${esc(action.href)}"${extra}>${ICON_EDIT} ${esc(action.label)}</a>`;
  }
}

export function setActiveNav(name) {
  for (const link of navEl.querySelectorAll('a')) {
    link.classList.toggle('is-active', link.dataset.nav === name);
  }
}
