/** User badges. */

import { esc } from '../core/utils.js';

export function userBadges(user) {
  const color = (value, fallback) => /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value || '') ? value : fallback;
  return (user?.banners || []).map((badge) => {
    const kind = badge.text?.toLowerCase();
    const background = kind === 'tayto' ? '#dfe7f6' : color(badge.background, '#dfe7f6');
    const foreground = color(badge.color, '#23497b');
    return `<span class="user-badge" style="--badge-bg:${background};--badge-fg:${foreground}">${esc(badge.text)}</span>`;
  }).join('');
}
