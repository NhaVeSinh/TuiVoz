// imgur album import, ported from the userscript. The userscript used GM_xmlhttpRequest to bypass CORS; from a
// page the same-origin edge proxy is used instead.

import { xf } from '../api.js';
import { downloadImagesInParallel } from './stickers.js';

// Accepts https://imgur.com/a/<id> and https://imgur.com/a/<slug>-<id>.
export function extractAlbumId(value) {
  const match = String(value ?? '').match(/imgur\.com\/a\/(.+?)(?:[/?#]|$)/i);
  if (!match) return null;
  const albumPath = match[1];
  const parts = albumPath.split('-');
  const candidate = parts.length > 1 ? parts[parts.length - 1] : albumPath;
  return /^[\w-]{1,32}$/.test(candidate) ? candidate : null;
}

const imageCache = new Map();

export function clearImgurCache() {
  imageCache.clear();
}

// Returns [{ link }] for every image in the album.
export async function fetchImgurAlbumImages(albumId, { signal } = {}) {
  if (imageCache.has(albumId)) return imageCache.get(albumId);
  const request = xf(`/imgur/album/${encodeURIComponent(albumId)}/images`, { signal }).then((data) => {
    if (data?.success !== true || !Array.isArray(data.data) || !data.data.length) {
      throw new Error('Album không được tìm thấy hoặc trống.');
    }
    const images = data.data.filter((img) => img && typeof img.link === 'string' && img.link.includes('imgur.com'));
    if (!images.length) throw new Error('Album không có hình ảnh hợp lệ để hiển thị.');
    return images;
  });
  imageCache.set(albumId, request);
  try {
    return await request;
  } catch (err) {
    imageCache.delete(albumId);
    throw err;
  }
}

// Full import: album metadata + base64 of every image (bounded concurrency).
export async function importImgurAlbum({ name, link, onProgress }) {
  const albumId = extractAlbumId(link);
  if (!albumId) {
    return { ok: false, error: 'Định dạng URL album imgur không hợp lệ. Ví dụ: https://imgur.com/a/ALBUMID' };
  }
  const report = (message) => onProgress && onProgress(message);
  report(`📡 Đang lấy hình ảnh từ imgur (Album ID: ${albumId})…`);
  const images = await fetchImgurAlbumImages(albumId);
  report(`✓ Đã tìm thấy ${images.length} hình ảnh. Đang tải ${Math.min(images.length, 5)} hình song song…`);
  const { base64Images, errors } = await downloadImagesInParallel(images.map((img) => img.link), {
    onProgress: (done, total, failed) => report(`⬇️ ${done}/${total} hình ảnh${failed ? ` (${failed} lỗi)` : ''}…`),
  });
  if (!base64Images.length) {
    return { ok: false, error: 'Không thể chuyển đổi bất kỳ hình ảnh nào (ảnh có thể chặn tải từ trình duyệt).' };
  }
  return {
    ok: true,
    album: {
      name,
      link,
      albumId,
      preview: base64Images[0].base64 || base64Images[0].url,
      images: base64Images,
      savedAt: new Date().toISOString(),
    },
    total: images.length,
    errors: errors.length,
  };
}
