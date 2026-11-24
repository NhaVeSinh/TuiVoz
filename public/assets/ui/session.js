/** Session bootstrap. */

import { app, state } from '../core/dom.js';
import { auth } from '../api.js';
import { renderAccount } from './chrome.js';

export async function loadSession() {
  try {
    const res = await auth.status();
    state.loggedIn = !!res.loggedIn;
    state.me = res.me || null;
  } catch {
    state.loggedIn = false;
    state.me = null;
  }
  renderAccount();
  startForumKeepAlive();
}

// XenForo rotates xf_session server-side when the session idles; keep-alive
// pings (same XHR voz fires itself) hold it + the xf_user remember-cookie warm.
// voz pings ~every 60s; we match that so the session never looks idle.
const KEEPALIVE_MS = 60 * 1000;
let keepAliveTimer = null;

function pingForumKeepAlive() {
  if (document.hidden || !state.loggedIn) return;
  fetch('/forum/login/keep-alive', {
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  }).catch(() => {});
}

function startForumKeepAlive() {
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(pingForumKeepAlive, KEEPALIVE_MS);
  document.addEventListener('visibilitychange', pingForumKeepAlive);
}

export function requireLogin() {
  if (state.loggedIn) return true;
  app.innerHTML = `
    <div class="block">
      <div class="block-header">Cần đăng nhập</div>
      <div class="block-body block-body--pad">
        <p>Chức năng này cần tài khoản voz.vn.</p>
        <a class="button button--primary" href="/login">Đăng nhập bằng voz.vn</a>
      </div>
    </div>`;
  return false;
}
