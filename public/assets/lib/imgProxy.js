/** Optional image proxying through the Vercel edge (/api/image-download). */

import { getProxyImages } from './settings.js';

// Returns the URL unchanged unless proxyImages is on and it's remote.
// Site-relative paths (/api/*, /forum/*) already ride the proxy.
export function imgSrc(url) {
  const raw = String(url || '');
  if (!getProxyImages() || !/^https?:\/\//i.test(raw)) return raw;
  return `/api/image-download?url=${encodeURIComponent(raw)}`;
}
