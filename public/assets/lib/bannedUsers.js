/** Banned-user check. */

import { api, ApiError } from '../api.js';
import { getBannedUsers } from './settings.js';

// voz.vn's own banned-strike class.
export const BANNED_CLASS = 'username--banned';

// XenForo error for a disabled/banned account.
export const BANNED_ERRCODE = 'this_users_profile_is_not_available';
// Member merely hid their profile — definitively not a ban.
const LIMITED_ERRCODE = 'member_limits_viewing_profile';

// These flags only mean "worth asking"; the error code decides.
export function mayBeBanned(user) {
  return !!user && !user.is_staff && user.can_view_profile === false && user.can_view_profile_posts === false;
}

// "all" resolves visible usernames too; "smart" is on-demand only.
export function shouldLookupBulk() {
  return getBannedUsers() === 'all';
}

export function bannedFeatureOn() {
  return getBannedUsers() !== 'off';
}

// Verdicts persist in IndexedDB, expiring after a week.
const DB_NAME = 'TuiVozBanStorage';
const DB_VERSION = 1;
const STORE = 'verdicts';
const TTL = 7 * 24 * 60 * 60_000;

const cache = new Map();
let database = null;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open IndexedDB'));
  });
}

async function loadVerdicts() {
  if (!('indexedDB' in window)) return;
  try {
    database = await openDatabase();
    const store = database.transaction(STORE, 'readonly').objectStore(STORE);
    const rows = (await requestResult(store.getAll())) || [];
    const now = Date.now();
    const expired = [];
    for (const row of rows) {
      if (!row || !row.id) continue;
      if (now - row.at > TTL) {
        expired.push(row.id);
        continue;
      }
      cache.set(Number(row.id), { banned: !!row.banned, at: row.at });
    }
    if (expired.length) pruneVerdicts(expired);
  } catch {
    // Private mode / blocked upgrade: memory only.
    database = null;
  }
}

function pruneVerdicts(ids) {
  if (!database) return;
  try {
    const store = database.transaction(STORE, 'readwrite').objectStore(STORE);
    for (const id of ids) store.delete(Number(id));
  } catch { /* best effort */ }
}

// Writes batched into one transaction per tick.
const queued = new Map();
let flushScheduled = false;

function flushVerdicts() {
  flushScheduled = false;
  if (!database || !queued.size) return;
  const rows = [...queued.values()];
  queued.clear();
  try {
    const store = database.transaction(STORE, 'readwrite').objectStore(STORE);
    for (const row of rows) store.put(row);
  } catch { /* best effort */ }
}

function persistVerdict(id, banned, at) {
  if (!database) return;
  queued.set(Number(id), { id: Number(id), banned, at });
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(flushVerdicts);
}

let loadPromise = null;
const ensureLoaded = () => (loadPromise ||= loadVerdicts());

// Only definitive verdicts are cached; errors stay retryable.
export async function checkBanned(userOrId) {
  if (!bannedFeatureOn()) return false;
  const user = typeof userOrId === 'object' && userOrId !== null ? userOrId : null;
  const id = Number(user ? user.user_id : userOrId);
  if (!id) return false;
  if (user && !mayBeBanned(user)) return false;
  await ensureLoaded();
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.banned;
  try {
    await api.profilePosts(id, 1);
    storeVerdict(id, false);
    return false;
  } catch (err) {
    if (err instanceof ApiError && err.code === BANNED_ERRCODE) {
      storeVerdict(id, true);
      return true;
    }
    // LIMITED is "not banned"; other errors stay uncached for retry.
    if (err instanceof ApiError && err.code === LIMITED_ERRCODE) storeVerdict(id, false);
    // 429 = voz.vn throttle; warn once.
    if (err instanceof ApiError && err.status === 429) warnRateLimited();
    return false;
  }
}

let rateWarned = false;

function warnRateLimited() {
  if (rateWarned) return;
  rateWarned = true;
  import('../ui/feedback.js')
    .then(({ toast }) => toast('voz.vn đang giới hạn lượt gọi — tạm dừng kiểm tra nick bị ban, thử lại sau ít phút.'))
    .catch(() => {});
}

function storeVerdict(id, banned) {
  const at = Date.now();
  cache.set(id, { banned, at });
  persistVerdict(id, banned, at);
}

// Prefix match so compound classes ("username comment-user") still hit.
const USERNAME_SELECTOR = '[class*="username"]';

export function forgetBanned(userId) {
  const id = Number(userId);
  cache.delete(id);
  queued.delete(id);
  pruneVerdicts([id]);
}

// Toggling off must not leave struck names behind.
export function clearBannedMarks(root = document) {
  for (const el of root.querySelectorAll(`.${BANNED_CLASS}`)) el.classList.remove(BANNED_CLASS);
}

// "smart" on-demand lookup; toggles the strike on elements.
export async function applyBannedMark(elements, userId) {
  const els = (Array.isArray(elements) ? elements : [elements]).filter(Boolean);
  const id = Number(userId);
  if (!id || !bannedFeatureOn() || !els.length) return false;
  const banned = await checkBanned(id);
  for (const el of els) {
    if (!el.isConnected) continue;
    el.classList.toggle(BANNED_CLASS, banned);
  }
  return banned;
}

// Strike banned usernames; one request per author, deferred till near viewport.
function collectBuckets(root, users) {
  const visible = new Set();
  for (const user of users) {
    if (user && typeof user.can_view_profile === 'boolean' && !mayBeBanned(user)) visible.add(Number(user.user_id));
  }
  const buckets = new Map();
  for (const el of root.querySelectorAll(USERNAME_SELECTOR)) {
    if (el.classList.contains(BANNED_CLASS)) continue;
    const id = Number(el.closest('[data-member-id]')?.dataset.memberId);
    if (!id || visible.has(id)) continue;
    if (!buckets.has(id)) buckets.set(id, []);
    buckets.get(id).push(el);
  }
  return buckets;
}

// Tight margin: wider would fire requests for a whole page at once.
const OBSERVE_MARGIN = '150px 0px';

// Per-element callback; one shared observer can't key the member id.
const pending = new WeakMap();

let nameObserver = null;

function getObserver() {
  nameObserver ||= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const run = pending.get(entry.target);
        nameObserver.unobserve(entry.target);
        pending.delete(entry.target);
        if (run) run();
      }
    },
    { rootMargin: OBSERVE_MARGIN }
  );
  return nameObserver;
}

export function wireBannedUsernames(root, users = []) {
  // Only "all" scans the page; "smart" resolves on demand.
  if (!shouldLookupBulk()) return;
  if (!root) return;
  for (const [id, els] of collectBuckets(root, users)) {
    const apply = () => {
      checkBanned(id).then((banned) => {
        if (!banned) return;
        for (const el of els) if (el.isConnected) el.classList.add(BANNED_CLASS);
      });
    };
    if (!('IntersectionObserver' in window)) {
      apply();
      continue;
    }
    // Observe the first copy; the whole group strikes together.
    pending.set(els[0], apply);
    getObserver().observe(els[0]);
  }
}
