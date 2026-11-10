// Formatting helpers shared by every view.

export const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// voz.vn rounds to K/M; the Hệ thống setting can print full figures. `scope` is 'thread' inside a thread view.
// The mode is pushed in by ui/theme.js — core/ must not import lib/.
export const FULL_NUMBERS_MODES = ['off', 'thread', 'all'];
let fullNumbersMode = 'off';

export function setFullNumbersMode(mode) {
  fullNumbersMode = FULL_NUMBERS_MODES.includes(mode) ? mode : 'off';
}

const isFull = (scope) => fullNumbersMode === 'all' || (fullNumbersMode === 'thread' && scope === 'thread');

export const num = (value, scope) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  if (isFull(scope)) return n.toLocaleString('en-US');
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
};

export const unix = (seconds) => (seconds ? Number(seconds) * 1000 : 0);

// Post numbers are always full: #13,661, never the rounded #14K.
export const postNumber = (value) => (Number(value) || 0).toLocaleString('en-US');

// Relative time; the full-numbers mode prints the absolute timestamp instead.
export function timeAgo(seconds, scope) {
  const ms = unix(seconds);
  if (!ms) return '';
  if (isFull(scope)) return fullDate(seconds);
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'vừa xong';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return new Date(ms).toLocaleDateString('vi-VN');
}

export function postDate(seconds, scope) {
  if (isFull(scope)) return fullDate(seconds);
  return Date.now() - unix(seconds) < 8 * 24 * 60 * 60 * 1000 ? timeAgo(seconds) : fullDate(seconds);
}

export function fullDate(seconds) {
  const ms = unix(seconds);
  if (!ms) return '';
  return new Date(ms).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// voz.vn prints only the year; the full-numbers mode prints the whole date.
export function joinDate(seconds, scope) {
  const ms = unix(seconds);
  if (!ms) return '—';
  if (isFull(scope)) {
    return new Date(ms).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  return String(new Date(ms).getFullYear());
}
