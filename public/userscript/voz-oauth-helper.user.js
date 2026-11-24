// ==UserScript==
// @name         VOZ OAuth helper
// @namespace    VOZ OAuth helper
// @version      1.0.0
// @description  Bắt mã uỷ quyền OAuth2 của voz.vn
// @match        https://voz.vn/oauth2/*
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// @noframes
// ==/UserScript==
/** voz.vn OAuth helper. */

(function () {
  'use strict';

  const PANEL_ID = 'voz-oauth-helper-panel';
  const STORE_KEY = 'voz_oauth_last_code';

  /* utilities */

  function log(...args) {
    console.log('%c[voz-oauth]', 'color:#ff6600;font-weight:700', ...args);
  }

  function copyText(text) {
    if (typeof GM_setClipboard === 'function') {
      GM_setClipboard(text, 'text');
      return Promise.resolve();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return Promise.resolve();
  }

  function rememberCode(code) {
    try {
      if (typeof GM_setValue === 'function') GM_setValue(STORE_KEY, code);
      sessionStorage.setItem(STORE_KEY, code);
    } catch (err) {
      log('không lưu được code', err);
    }
  }

  function readRememberedCode() {
    try {
      if (typeof GM_getValue === 'function') {
        const v = GM_getValue(STORE_KEY, '');
        if (v) return v;
      }
      return sessionStorage.getItem(STORE_KEY) || '';
    } catch {
      return '';
    }
  }

  /* panel UI */

  function buildPanel(code, state) {
    const old = document.getElementById(PANEL_ID);
    if (old) old.remove();

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.setAttribute(
      'style',
      [
        'position:fixed',
        'right:16px',
        'bottom:16px',
        'z-index:2147483647',
        'width:340px',
        'background:#f4f5f5',
        'color:#202122',
        'border:1px solid #d5d8db',
        'border-radius:6px',
        'box-shadow:0 8px 28px rgba(0,0,0,.35)',
        'font:14px/1.45 "Segoe UI",Roboto,Arial,sans-serif',
        'overflow:hidden',
      ].join(';')
    );

    const header = document.createElement('div');
    header.setAttribute(
      'style',
      'background:#5c7099;color:#ebecED;padding:8px 12px;font-weight:600;display:flex;align-items:center;gap:8px'
    );
    header.textContent = 'VOZ OAuth — đã lấy được code';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.setAttribute(
      'style',
      'margin-left:auto;background:none;border:0;color:inherit;font-size:20px;line-height:1;cursor:pointer'
    );
    closeBtn.addEventListener('click', () => panel.remove());
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.setAttribute('style', 'padding:12px');

    const codeBox = document.createElement('textarea');
    codeBox.readOnly = true;
    codeBox.value = code;
    codeBox.setAttribute(
      'style',
      'width:100%;box-sizing:border-box;min-height:64px;padding:8px;border:1px dashed #d5d8db;border-radius:4px;background:#fff;font:12px/1.4 Consolas,monospace;word-break:break-all;resize:vertical'
    );

    const meta = document.createElement('div');
    meta.setAttribute('style', 'font-size:12px;color:#8a8e93;margin:6px 0 10px');
    meta.textContent = state ? `state: ${state}` : '';

    const row = document.createElement('div');
    row.setAttribute('style', 'display:flex;gap:8px;flex-wrap:wrap');

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy code';
    copyBtn.setAttribute(
      'style',
      'padding:6px 12px;border:0;border-radius:4px;background:#5c7099;color:#ebecED;font:inherit;font-weight:600;cursor:pointer'
    );
    copyBtn.addEventListener('click', async () => {
      await copyText(code);
      copyBtn.textContent = 'Đã copy ✓';
      setTimeout(() => {
        copyBtn.textContent = 'Copy code';
      }, 1800);
    });

    row.appendChild(copyBtn);

    const hint = document.createElement('div');
    hint.setAttribute('style', 'font-size:12px;color:#8a8e93;margin-top:10px');
    hint.textContent =
      'Dán code này vào ô "Mã uỷ quyền" trên web client rồi bấm Đăng nhập. Code chỉ dùng được một lần.';

    body.appendChild(codeBox);
    body.appendChild(meta);
    body.appendChild(row);
    body.appendChild(hint);
    panel.appendChild(header);
    panel.appendChild(body);

    (document.body || document.documentElement).appendChild(panel);
  }

  /* code extraction */

  function extractCode(text) {
    if (!text) return null;
    const match = String(text).match(/[?&]code=([A-Za-z0-9._~-]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function extractState(text) {
    if (!text) return null;
    const match = String(text).match(/[?&]state=([A-Za-z0-9._~-]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function handleCode(code, state, source) {
    if (!code) return;
    log('bắt được code từ', source, code);
    rememberCode(code);
    const show = () => buildPanel(code, state);
    if (document.body) show();
    else document.addEventListener('DOMContentLoaded', show, { once: true });
  }

  /* interception */

  const originalAssign = window.location.assign.bind(window.location);
  const originalReplace = window.location.replace.bind(window.location);

  function guardNavigation(url) {
    if (typeof url === 'string' && url.startsWith('vozma26://')) {
      handleCode(extractCode(url), extractState(url), 'location');
      return true;
    }
    return false;
  }

  try {
    window.location.assign = function (url) {
      if (guardNavigation(url)) return;
      return originalAssign(url);
    };
    window.location.replace = function (url) {
      if (guardNavigation(url)) return;
      return originalReplace(url);
    };
  } catch (err) {
    log('không patch được location', err);
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      try {
        const url = typeof args[0] === 'string' ? args[0] : args[0] && args[0].url;
        if (url && url.includes('/oauth2/authorize')) {
          const clone = response.clone();
          const text = await clone.text();
          const code = extractCode(text);
          if (code) handleCode(code, extractState(text), 'fetch');
        }
      } catch (err) {
        log('lỗi đọc response', err);
      }
      return response;
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__vozUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (this.__vozUrl && String(this.__vozUrl).includes('/oauth2/authorize')) {
      this.addEventListener('load', () => {
        try {
          const code = extractCode(this.responseText);
          if (code) handleCode(code, extractState(this.responseText), 'xhr');
        } catch (err) {
          log('lỗi đọc xhr', err);
        }
      });
    }
    return originalSend.apply(this, args);
  };

  function patchAuthorizeForm() {
    if (!location.pathname.startsWith('/oauth2/authorize')) return;
    const form = document.querySelector('form[action*="/oauth2/authorize"]');
    if (!form) return;
    if (form.dataset.vozPatched) return;
    form.dataset.vozPatched = '1';
    const action = form.getAttribute('action');
    if (action && !action.includes('_xfResponseType')) {
      form.setAttribute('action', `${action}&_xfResponseType=json`);
      log('đã thêm _xfResponseType=json vào form authorize');
    }
  }

  function checkCurrentUrl() {
    const href = location.href;
    if (href.startsWith('vozma26://')) {
      handleCode(extractCode(href), extractState(href), 'url');
      return;
    }
    if (location.pathname.startsWith('/oauth2/')) {
      const remembered = readRememberedCode();
      if (remembered && !document.getElementById(PANEL_ID)) {
        buildPanel(remembered, null);
      }
    }
  }

  function checkJsonBody() {
    if (!location.pathname.startsWith('/oauth2/authorize')) return;
    const text = (document.body && document.body.innerText) || '';
    if (!text.trimStart().startsWith('{')) return;
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      return;
    }
    const redirect = payload && payload.redirect;
    if (!redirect) return;
    handleCode(extractCode(redirect), extractState(redirect), 'json-body');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      patchAuthorizeForm();
      checkCurrentUrl();
      checkJsonBody();
    });
  } else {
    patchAuthorizeForm();
    checkCurrentUrl();
    checkJsonBody();
  }

  if (location.pathname.startsWith('/oauth2/deny')) {
    log('người dùng đã từ chối uỷ quyền');
  }
})();
