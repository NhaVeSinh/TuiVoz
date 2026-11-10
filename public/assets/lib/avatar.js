// Avatars. voz.vn serves them from data.voz.vn and falls back to a coloured initial.

import { esc } from '../core/utils.js';

// voz.vn buckets avatar files by floor(user_id / 1000).
export function avatarUrlById(userId, size = 's') {
  const id = Number(userId);
  if (!id) return '';
  return `https://data.voz.vn/avatars/${size}/${Math.floor(id / 1000)}/${id}.jpg`;
}

// XenForo's generated avatars cycle through a fixed palette; each pair clears WCAG AA.
const DYNAMIC_AVATAR = [
  ['#66cc66', '#0d2b0d'],
  ['#669966', '#0a140a'],
  ['#33cc99', '#0a2a1f'],
  ['#339966', '#06130d'],
  ['#66cc33', '#12260a'],
  ['#66cccc', '#0d2b2b'],
  ['#99cc66', '#203010'],
];

// Avatar over a coloured initial, so a missing image degrades to voz.vn's generated one.
export function avatarMarkup(user, size = 's') {
  const id = Number(user && user.user_id) || 0;
  const urls = (user && user.avatar_urls) || {};
  // A stub user has no avatar_urls, so guess the canonical path. All-null means the member genuinely has no
  // avatar — guessing there would only produce 404s.
  const known = Object.keys(urls).length > 0;
  const src = known
    ? urls[size] || urls.m || urls.l || urls.o || ''
    : avatarUrlById(id, size);
  const [bg, fg] = DYNAMIC_AVATAR[id % DYNAMIC_AVATAR.length];
  const initial = esc(((user && user.username) || '?').slice(0, 1).toUpperCase());
  const img = src
    ? `<img class="avatar-img" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
    : '';
  return `<span class="avatar-fallback" style="background:${bg};color:${fg}"><span aria-hidden="true">${initial}</span>${img}</span>`;
}
