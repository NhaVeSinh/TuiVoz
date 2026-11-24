/** Login view. */

import { app, state } from '../core/dom.js';
import { navigate } from '../core/nav.js';
import { auth } from '../api.js';
import { setActiveNav, setBreadcrumbs } from '../ui/chrome.js';
import { setBrandTitle } from '../ui/title.js';
import { toast } from '../ui/feedback.js';
import { renderAccount } from '../ui/chrome.js';

function b64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function makePkce() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = b64url(new Uint8Array(digest));
  const stateValue = b64url(crypto.getRandomValues(new Uint8Array(16)));
  return { verifier, challenge, state: stateValue };
}

export async function viewLogin() {
  setActiveNav('');
  setBreadcrumbs([{ label: 'Diễn đàn', href: '/' }, { label: 'Đăng nhập' }]);
  setBrandTitle();
  if (!state.config) state.config = await auth.config();
  const cfg = state.config;

  app.innerHTML = `
    <div class="login-wrap">
      <div class="block">
        <div class="block-header">Đăng nhập bằng voz.vn</div>
        <div class="block-body block-body--pad">
          <div id="tab-code">
            <ol class="login-steps">
              <li>Cài userscript <a href="/userscript/voz-oauth-helper.user.js" target="_blank" rel="noopener">voz-oauth-helper.user.js</a> (Tampermonkey / Violentmonkey).</li>
              <li>Bấm <b>Lấy mã uỷ quyền</b> — cửa sổ voz.vn mở ra, bấm <b>Authorize</b>.</li>
              <li>Userscript bắt mã và hiện nút <b>Copy code</b>.<br><b>Lưu ý:</b> Trình duyệt Firefox có thể sẽ không hiển thị được nút Copy code phải tự copy đường link <code>vozma26://oauth...</code></li>
              <li>Dán mã vào ô dưới rồi bấm <b>Đăng nhập</b>.</li>
            </ol>
            <div class="formRow">
              <button class="button button--primary" type="button" id="open-authorize">Lấy mã uỷ quyền</button>
            </div>
            <div class="formRow">
              <label for="auth-code">Mã uỷ quyền (code)</label>
              <textarea class="code-box" id="auth-code" placeholder="Dán code hoặc cả URL vozma26://oauth?code=..."></textarea>
              <div class="formHint" id="pkce-hint"></div>
            </div>
            <button class="button button--primary" type="button" id="exchange-btn">Đăng nhập</button>
          </div>
        </div>
      </div>
    </div>`;

  let pkce = null;
  const hint = document.getElementById('pkce-hint');

  const ensurePkce = async () => {
    if (!pkce) {
      pkce = await makePkce();
      sessionStorage.setItem('voz_pkce', JSON.stringify(pkce));
      hint.textContent = `PKCE challenge: ${pkce.challenge.slice(0, 24)}…`;
    }
    return pkce;
  };

  const stored = sessionStorage.getItem('voz_pkce');
  if (stored) {
    try {
      pkce = JSON.parse(stored);
      hint.textContent = `PKCE challenge: ${pkce.challenge.slice(0, 24)}…`;
    } catch {
      pkce = null;
    }
  }

  document.getElementById('open-authorize').addEventListener('click', async () => {
    const p = await ensurePkce();
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      response_type: 'code',
      scope: cfg.scopes,
      code_challenge: p.challenge,
      code_challenge_method: 'S256',
      state: p.state,
    });
    const url = `${cfg.authorizeUrl}?${params.toString()}`;
    const popup = window.open(url, 'voz-oauth', 'width=560,height=760');
    if (!popup) toast('Trình duyệt chặn popup — cho phép popup rồi thử lại', true);
  });

  document.getElementById('exchange-btn').addEventListener('click', async () => {
    const raw = document.getElementById('auth-code').value.trim();
    if (!raw) return toast('Chưa có code', true);
    const match = raw.match(/[?&]code=([^&\s]+)/);
    const code = match ? decodeURIComponent(match[1]) : raw;
    const p = await ensurePkce();
    const btn = document.getElementById('exchange-btn');
    btn.disabled = true;
    btn.textContent = 'Đang đổi token…';
    try {
      const { ok, data } = await auth.exchange(code, p.verifier);
      if (!ok) throw new Error(data.detail || data.error || 'Đổi token thất bại');
      sessionStorage.removeItem('voz_pkce');
      state.loggedIn = true;
      state.me = data.me;
      renderAccount();
      toast(`Xin chào ${data.me.username}`);
      navigate('/');
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
      btn.textContent = 'Đăng nhập';
    }
  });
}
