// Thread prefixes. The id → colour mapping is what voz.vn renders.

import { esc } from '../core/utils.js';

const PREFIX_CLASS = {
  4: 'green', 5: 'red', 6: 'royalBlue', 7: 'orange',
  8: 'green', 9: 'red', 10: 'royalBlue', 11: 'orange',
  12: 'primary', 13: 'accent', 14: 'red', 15: 'green',
  16: 'orange', 17: 'royalBlue', 18: 'gray', 19: 'olive',
  20: 'red', 21: 'green', 22: 'royalBlue',
};

export function prefixLabel(thread) {
  if (!thread || !thread.prefix) return '';
  const cls = PREFIX_CLASS[thread.prefix_id] || 'gray';
  return `<span class="label label--${cls}">${esc(thread.prefix)}</span> `;
}
