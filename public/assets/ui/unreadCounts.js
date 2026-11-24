/** Unread badges. */

import { state } from '../core/dom.js';
import { api } from '../api.js';
import { isDataSaving } from '../lib/dataSaving.js';

let pending;
let lastRefresh = 0;

// Throttle fetches to 30s; `force` bypasses the interval and in-flight dedupe.
const MIN_REFRESH_INTERVAL = 30_000;

export async function refreshUnreadCounts(force = false) {
  if (!state.loggedIn || !state.me) return;
  if (pending) {
    if (force === true) await pending;
    else return pending;
  }
  if (!force && Date.now() - lastRefresh < MIN_REFRESH_INTERVAL) return;
  if (!state.loggedIn || !state.me) return;
  const userId = state.me.user_id;
  pending = Promise.allSettled([api.unreadConversations(), api.unviewedAlerts()]).then((results) => {
    lastRefresh = Date.now();
    if (!state.loggedIn || state.me?.user_id !== userId) return;
    for (const [index, kind] of ['dm', 'alerts'].entries()) {
      if (results[index].status !== 'fulfilled') continue;
      const count = Number(results[index].value.pagination?.total);
      if (!Number.isFinite(count) || count < 0) continue;
      const button = document.querySelector(`[data-header-menu="${kind}"]`);
      if (!button) continue;
      let badge = button.querySelector('.header-unread');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'header-unread';
        badge.setAttribute('aria-hidden', 'true');
        button.append(badge);
      }
      badge.hidden = count === 0;
      badge.textContent = count > 99 ? '99+' : String(count);
      const label = kind === 'dm' ? 'Hộp thư' : 'Thông báo';
      button.setAttribute('aria-label', count ? `${label}: ${count} chưa đọc` : label);
      button.title = count ? `${label}: ${count} chưa đọc` : label;
    }
  }).finally(() => { pending = null; });
  return pending;
}

export function wireUnreadCounts() {
  window.addEventListener('focus', refreshUnreadCounts);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshUnreadCounts();
  });
  setInterval(() => {
    // Save mode pauses the poll; navigation/focus still refresh (throttled).
    if (!document.hidden && !isDataSaving()) refreshUnreadCounts();
  }, 60000);
}
