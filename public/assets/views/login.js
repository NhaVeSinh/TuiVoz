/** Login view. */

import { app, state } from '../core/dom.js';
import { navigate } from '../core/nav.js';
import { auth } from '../api.js';
import { setActiveNav, setBreadcrumbs } from '../ui/chrome.js';
import { setBrandTitle } from '../ui/title.js';
import { toast } from '../ui/feedback.js';
import { renderAccount } from '../ui/chrome.js';

const PKCE_KEY = 'voz_pkce';
const FORUM = '/forum';

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

function authorizeUrl(cfg, p, proxied) {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: cfg.scopes,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    state: p.state,
  });
  const base = proxied ? `${location.origin}${FORUM}/oauth2/authorize` : cfg.authorizeUrl;
  return `${base}?${params.toString()}`;
}

function savePkce(p) {
  sessionStorage.setItem(PKCE_KEY, JSON.stringify(p));
}

function loadPkce() {
  try {
    return JSON.parse(sessionStorage.getItem(PKCE_KEY) || 'null');
  } catch {
    return null;
  }
}

function clearPkce() {
  sessionStorage.removeItem(PKCE_KEY);
}

async function finishLogin(code, verifier) {
  const { ok, data } = await auth.exchange(code, verifier);
  if (!ok) throw new Error(data.detail || data.error || 'Đổi token thất bại');
  clearPkce();
  state.loggedIn = true;
  state.me = data.me;
  renderAccount();
  toast(`Xin chào ${data.me.username}`);
  navigate('/');
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
          <p class="formHint">Đăng nhập trực tiếp với voz.vn — không cần userscript hay copy mã nữa. Nếu chưa đăng nhập, trang login của voz sẽ hiện ngay trong luồng.</p>
          <div class="formRow">
            <button class="button button--primary" type="button" id="oauth-login">Đăng nhập với voz.vn</button>
          </div>
          <div class="formError" id="login-error" hidden></div>

          <details class="login-manual">
            <summary>Cách cũ (copy mã — nếu luồng tự động không chạy)</summary>
            <ol class="login-steps">
              <li>Cài userscript <a href="/userscript/voz-oauth-helper.user.js" target="_blank" rel="noopener">voz-oauth-helper.user.js</a> (Tampermonkey / Violentmonkey).</li>
              <li>Bấm <b>Lấy mã uỷ quyền</b> — cửa sổ voz.vn mở ra, bấm <b>Authorize</b>.</li>
              <li>Userscript bắt mã và hiện nút <b>Copy code</b>.<br><b>Lưu ý:</b> Trình duyệt Firefox có thể sẽ không hiển thị được nút Copy code phải tự copy đường link <code>vozma26://oauth...</code></li>
              <li>Dán mã vào ô dưới rồi bấm <b>Đăng nhập</b>.</li>
            </ol>
            <div class="formRow">
              <button class="button" type="button" id="open-authorize">Lấy mã uỷ quyền</button>
            </div>
            <div class="formRow">
              <label for="auth-code">Mã uỷ quyền (code)</label>
              <textarea class="code-box" id="auth-code" placeholder="Dán code hoặc cả URL vozma26://oauth?code=..."></textarea>
              <div class="formHint" id="pkce-hint"></div>
            </div>
            <button class="button" type="button" id="exchange-btn">Đăng nhập</button>
          </details>
        </div>
      </div>
    </div>`;

  const errEl = document.getElementById('login-error');
  const showErr = (msg) => {
    errEl.hidden = !msg;
    errEl.textContent = msg || '';
  };

  let pkce = loadPkce();
  const ensurePkce = async () => {
    if (!pkce) {
      pkce = await makePkce();
      savePkce(pkce);
    }
    return pkce;
  };
  const hint = document.getElementById('pkce-hint');
  const showPkceHint = () => {
    if (pkce) hint.textContent = `PKCE challenge: ${pkce.challenge.slice(0, 24)}…`;
  };
  showPkceHint();

  // One-tap: same-tab through the /forum proxy (xf_session lives there);
  // the proxy catches the vozma26:// redirect back to /oauth-callback.
  document.getElementById('oauth-login').addEventListener('click', async () => {
    showErr('');
    const p = await ensurePkce();
    location.href = authorizeUrl(cfg, p, true);
  });

  document.getElementById('open-authorize').addEventListener('click', async () => {
    const p = await ensurePkce();
    showPkceHint();
    const popup = window.open(authorizeUrl(cfg, p, false), 'voz-oauth', 'width=560,height=760');
    if (!popup) toast('Trình duyệt chặn popup — cho phép popup rồi thử lại', true);
  });

  document.getElementById('exchange-btn').addEventListener('click', async () => {
    const raw = document.getElementById('auth-code').value.trim();
    if (!raw) return showErr('Chưa có code');
    const match = raw.match(/[?&]code=([^&\s]+)/);
    const code = match ? decodeURIComponent(match[1]) : raw;
    const p = await ensurePkce();
    const btn = document.getElementById('exchange-btn');
    btn.disabled = true;
    btn.textContent = 'Đang đổi token…';
    try {
      await finishLogin(code, p.verifier);
    } catch (err) {
      showErr(err.message);
      btn.disabled = false;
      btn.textContent = 'Đăng nhập';
    }
  });
}

// voz redirects to vozma26://oauth?code=…&state=…; the /forum proxy rewrites it
// here so the SPA can finish the PKCE exchange without the userscript.
export async function viewOauthCallback(params) {
  setBreadcrumbs([{ label: 'Diễn đàn', href: '/' }, { label: 'Đăng nhập' }]);
  app.innerHTML = `
    <div class="login-wrap">
      <div class="block">
        <div class="block-header">Đăng nhập bằng voz.vn</div>
        <div class="block-body block-body--pad">
          <p class="formHint" id="cb-status">Đang đổi mã uỷ quyền…</p>
          <div class="formError" id="cb-error" hidden></div>
          <p class="formHint"><a href="/login">Quay lại trang đăng nhập</a></p>
        </div>
      </div>
    </div>`;

  const statusEl = document.getElementById('cb-status');
  const errEl = document.getElementById('cb-error');
  const fail = (msg) => {
    statusEl.textContent = 'Đăng nhập không thành công.';
    errEl.hidden = false;
    errEl.textContent = msg;
  };

  const code = params.get('code');
  const retState = params.get('state');
  const stored = loadPkce();
  if (!code) return fail('voz không trả mã uỷ quyền (code).');
  if (!stored) return fail('Mất phiên PKCE — hãy bấm Đăng nhập lại từ đầu.');
  if (retState && stored.state && retState !== stored.state) {
    return fail('Mã state không khớp — có thể phiên đã hết hạn. Bấm Đăng nhập lại.');
  }
  try {
    await finishLogin(code, stored.verifier);
  } catch (err) {
    fail(err.message);
  }
}
