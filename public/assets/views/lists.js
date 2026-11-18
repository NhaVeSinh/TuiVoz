// Alerts, bookmarks and watched threads.

import { app } from '../core/dom.js';
import { esc, num, timeAgo } from '../core/utils.js';
import { userPath, withPage } from '../core/paths.js';
import { api } from '../api.js';
import { setActiveNav, setBreadcrumbs } from '../ui/chrome.js';
import { setTitle } from '../ui/title.js';
import { loading, errorBox } from '../ui/feedback.js';
import { pagination, wirePageJump } from '../ui/pagination.js';
import { requireLogin } from '../ui/session.js';
import { threadRow, postRow, wireThreadRowBans } from '../ui/threadRow.js';
import { avatarMarkup } from '../lib/avatar.js';
import { alertTextMarkup } from '../ui/alertMarkup.js';

export async function viewAlerts(page) {
  setActiveNav('alerts');
  setBreadcrumbs([{ label: 'Diễn đàn', href: '/' }, { label: 'Thông báo' }]);
  setTitle('Alerts', page);
  if (!requireLogin()) return;
  loading();
  try {
    const res = await api.alerts(page);
    const alerts = res.alerts || [];
    const alertRows = await Promise.all(alerts.map(async (a) => `
              <div class="alert-row${a.read_date ? '' : ' is-unread'}">
                <a href="${userPath(a.User || { user_id: a.user_id, username: a.username })}" class="avatar">${avatarMarkup(a.User, 's')}</a>
                <div class="alert-main">
                  <a data-alert="${a.alert_id}" href="${a.content_type === 'post' && a.content_id ? `/p/${Number(a.content_id)}/` : a.content_type === 'profile_post' && a.content_id ? `/profile-posts/${Number(a.content_id)}/` : a.content_type === 'profile_post_comment' && a.content_id ? `/profile-posts/comments/${Number(a.content_id)}/` : a.alert_url ? a.alert_url.replace(/^https?:\/\/voz\.vn/, '') : userPath(a.User || { user_id: a.user_id, username: a.username })}">${await alertTextMarkup(a)}</a>
                  ${a.content_title ? `<div class="u-smaller u-dimmed">${esc(a.content_title)}</div>` : ''}
                  <div class="alert-time">${timeAgo(a.event_date)}</div>
                </div>
              </div>`));
    app.innerHTML = `
      <div class="block">
        <div class="block-header">Thông báo<span class="block-header-extra">${num(res.pagination && res.pagination.total)}</span></div>
        ${
          alerts.length
            ? `<div>${alertRows.join('')}</div>`
            : '<div class="empty">Không có thông báo.</div>'
        }
        ${pagination(res.pagination, (p) => withPage('/alerts', p))}
      </div>`;
    wirePageJump((p) => withPage('/alerts', p));
    // Clicking an alert marks it read like the app's POST /alerts/{id}/mark (viewed all happens server-side).
    app.addEventListener('click', (event) => {
      const link = event.target.closest('[data-alert]');
      if (!link) return;
      api.markAlertRead(Number(link.dataset.alert)).catch(() => {});
      link.closest('.alert-row')?.classList.remove('is-unread');
    });
  } catch (err) {
    app.innerHTML = errorBox(err);
  }
}

export async function viewBookmarks(page) {
  setActiveNav('bookmarks');
  setBreadcrumbs([{ label: 'Diễn đàn', href: '/' }, { label: 'Đánh dấu' }]);
  setTitle('Bookmarks', page);
  if (!requireLogin()) return;
  loading();
  try {
    const res = await api.bookmarks(page);
    const items = res.bookmarks || [];
    app.innerHTML = `
      <div class="block">
        <div class="block-header">Bài viết đã đánh dấu</div>
        ${
          items.length
            ? `<div class="structItemContainer"><div class="structItemContainer-group">${items
                .map((b) => postRow(b.Post || {}, (b.Post && b.Post.Thread) || {}, res.pagination?.per_page))
                .join('')}</div></div>`
            : '<div class="empty">Chưa đánh dấu bài nào.</div>'
        }
        ${pagination(res.pagination, (p) => withPage('/bookmarks', p))}
      </div>`;
    wirePageJump((p) => withPage('/bookmarks', p));
  } catch (err) {
    app.innerHTML = errorBox(err);
  }
}

export async function viewWatched(page) {
  setActiveNav('watched');
  setBreadcrumbs([{ label: 'Diễn đàn', href: '/' }, { label: 'Theo dõi' }]);
  setTitle('Watched threads', page);
  if (!requireLogin()) return;
  loading();
  try {
    const res = await api.watched(page);
    const threads = res.threads || [];
    app.innerHTML = `
      <div class="block">
        <div class="block-header">Chủ đề đang theo dõi</div>
        ${
          threads.length
            ? `<div class="structItemContainer"><div class="structItemContainer-group">${threads
                .map((t) => threadRow(t, { showForum: true }))
                .join('')}</div></div>`
            : '<div class="empty">Chưa theo dõi chủ đề nào.</div>'
        }
        ${pagination(res.pagination, (p) => withPage('/watched', p))}
      </div>`;
    wireThreadRowBans(document.querySelector('.structItemContainer'), threads);
    wirePageJump((p) => withPage('/watched', p));
  } catch (err) {
    app.innerHTML = errorBox(err);
  }
}
