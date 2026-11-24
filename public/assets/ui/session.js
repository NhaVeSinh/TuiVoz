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
