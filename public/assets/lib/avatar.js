/** Avatars. */

import { esc } from '../core/utils.js';

// voz.vn buckets avatar files by floor(user_id / 1000).
export function avatarUrlById(userId, size = 's') {
  const id = Number(userId);
  if (!id) return '';
  return `https://data.voz.vn/avatars/${size}/${Math.floor(id / 1000)}/${id}.jpg`;
}

// XenForo generated-avatar palette; each pair clears WCAG AA.
const DYNAMIC_AVATAR = [
  ['#66cc66', '#0d2b0d'],
  ['#669966', '#0a140a'],
  ['#33cc99', '#0a2a1f'],
  ['#339966', '#06130d'],
  ['#66cc33', '#12260a'],
  ['#66cccc', '#0d2b2b'],
  ['#99cc66', '#203010'],
];

// Coloured initial underneath so a missing image degrades gracefully.
export function avatarMarkup(user, size = 's') {
  const id = Number(user && user.user_id) || 0;
  const urls = (user && user.avatar_urls) || {};
  // Stub users lack avatar_urls → guess path; all-null = no avatar.
  const known = Object.keys(urls).length > 0;
  const src = known
    ? urls[size] || urls.m || urls.l || urls.o || ''
    : avatarUrlById(id, size);
  // The next bucket up is exactly the 2x retina source.
  const RETINA = { xxs: 's', xs: 's', s: 'm', m: 'l', l: 'o', o: 'o' };
  const retinaSize = RETINA[size] || 'm';
  const retina = known
    ? urls[retinaSize] || urls.o || urls.l || urls.m || ''
    : avatarUrlById(id, retinaSize);
  const srcset = retina && retina !== src ? ` srcset="${esc(retina)} 2x"` : '';
  const [bg, fg] = DYNAMIC_AVATAR[id % DYNAMIC_AVATAR.length];
  const initial = esc(((user && user.username) || '?').slice(0, 1).toUpperCase());
  const img = src
    ? `<img class="avatar-img" src="${esc(src)}"${srcset} alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
    : '';
  return `<span class="avatar-fallback" style="background:${bg};color:${fg}"><span aria-hidden="true">${initial}</span>${img}</span>`;
}
