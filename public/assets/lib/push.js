/** XenForo web push: subscribe via /forum proxy (xf_session + _xfToken live there). */

const FORUM = '/forum';
const SUBSCRIBE_PATH = 'index.php?misc/update-push-subscription';
const DEFAULT_VAPID = 'BPPo5ZMIDnGRqO7goDiDVTGXpLgPpw3ftE3AekCNFLCHln2Sj+V+ogaGK/YWlAlTYrsc1Koz6WRkdCoEV0godEE=';

export const pushSupported = () =>
  typeof navigator !== 'undefined'
  && 'serviceWorker' in navigator
  && 'PushManager' in window
  && 'Notification' in window;

function b64uToBytes(b64url) {
  const pad = b64url.length % 4 ? '='.repeat(4 - (b64url.length % 4)) : '';
  const bin = atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// XenForo posts keys as plain btoa() output (standard base64, with padding).
function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// Scrape XF.config from a proxied forum page: csrf, userId (0 = guest), vapid key.
async function fetchPushConfig() {
  const res = await fetch(`${FORUM}/index.php`, { credentials: 'same-origin' });
  const html = await res.text();
  const csrf = /csrf:\s*'([^']+)'/.exec(html)?.[1] || '';
  const userId = parseInt(/userId:\s*(\d+)/.exec(html)?.[1] || '0', 10);
  const vapid = /pushAppServerKey:\s*'([^']+)'/.exec(html)?.[1] || DEFAULT_VAPID;
  return { csrf, userId, vapid, loggedIn: userId > 0 };
}

async function postSubscription(params) {
  const res = await fetch(`${FORUM}/${SUBSCRIBE_PATH}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: new URLSearchParams({ ...params, _xfResponseType: 'json' }),
  });
  const text = await res.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { /* voz returns redirect/html on bad csrf */ }
  return { ok: res.ok, payload, raw: text.slice(0, 300) };
}

// Subscribe browser + register endpoint with voz. Throws with .code for UI mapping.
export async function enablePush() {
  if (!pushSupported()) throw Object.assign(new Error('push_unsupported'), { code: 'unsupported' });
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw Object.assign(new Error('push_denied'), { code: permission === 'denied' ? 'denied' : 'dismissed' });
  }

  const cfg = await fetchPushConfig();
  if (!cfg.loggedIn) {
    throw Object.assign(new Error('push_guest'), { code: 'guest' });
  }

  const reg = await navigator.serviceWorker.ready;
  let sub;
  try {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64uToBytes(cfg.vapid),
    });
  } catch (e) {
    // Browser-side failure (Firefox autopush down/blocked, Chrome incognito…).
    // voz was never contacted — surface it distinctly from an upstream reject.
    throw Object.assign(new Error(e.message), { code: 'browser', name: e.name });
  }
  const p256dh = sub.getKey('p256dh');
  const auth = sub.getKey('auth');

  const { ok, payload, raw } = await postSubscription({
    endpoint: sub.endpoint,
    key: p256dh ? bytesToB64(new Uint8Array(p256dh)) : '',
    token: auth ? bytesToB64(new Uint8Array(auth)) : '',
    encoding: (PushManager.supportedContentEncodings || ['aesgcm'])[0],
    unsubscribed: '0',
    _xfToken: cfg.csrf,
  });
  if (!ok || (payload && payload.status === 'error')) {
    // Clean up the browser subscription if voz rejected it.
    await sub.unsubscribe().catch(() => {});
    const msg = payload?.errors?.join?.(', ') || payload?.error || raw || 'subscribe failed';
    throw Object.assign(new Error('push_upstream'), { code: 'upstream', detail: msg });
  }
  return { endpoint: sub.endpoint };
}

// Unregister this browser on voz + drop the local subscription.
export async function disablePush() {
  if (!pushSupported()) return { off: true };
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    try {
      const cfg = await fetchPushConfig();
      if (cfg.csrf) {
        const p256dh = sub.getKey('p256dh');
        const auth = sub.getKey('auth');
        await postSubscription({
          endpoint: sub.endpoint,
          key: p256dh ? bytesToB64(new Uint8Array(p256dh)) : '',
          token: auth ? bytesToB64(new Uint8Array(auth)) : '',
          encoding: (PushManager.supportedContentEncodings || ['aesgcm'])[0],
          unsubscribed: '1',
          _xfToken: cfg.csrf,
        });
      }
    } catch {
      /* best-effort remote unregister */
    }
    await sub.unsubscribe().catch(() => {});
  }
  return { off: true };
}

export async function pushStatus() {
  if (!pushSupported()) return { supported: false };
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return {
    supported: true,
    permission: Notification.permission,
    subscribed: !!sub,
  };
}
