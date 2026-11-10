// Attachment URL resolution for the visual editor. A post body carries [ATTACH]3860636[/ATTACH] while the real
// URL lives in post.Attachments[], so the view registers what it fetched.

const registry = new Map();

function normalise(attachment) {
  if (!attachment || typeof attachment !== 'object') return null;
  const id = Number(attachment.attachment_id);
  if (!id) return null;
  const url = attachment.direct_url || attachment.url || attachment.thumbnail_url;
  if (!/^https:\/\//.test(String(url || ''))) return null;
  return {
    id,
    url,
    thumbnail: attachment.thumbnail_url || url,
    width: Number(attachment.width) || 0,
    height: Number(attachment.height) || 0,
    filename: attachment.filename || '',
    isVideo: attachment.is_video === true,
    isAudio: attachment.is_audio === true,
  };
}

// Registers attachments from one or more posts.
export function registerAttachments(source) {
  const lists = Array.isArray(source) ? source : [source];
  for (const list of lists) {
    if (!list) continue;
    const items = Array.isArray(list) ? list : Array.isArray(list.Attachments) ? list.Attachments : [list];
    for (const item of items) {
      const attachment = normalise(item);
      if (attachment) registry.set(String(attachment.id), attachment);
    }
  }
  return registry.size;
}

export function getAttachment(id) {
  return registry.get(String(id)) || null;
}

// Reverse lookup: the rendered <img> only knows its src.
export function attachmentIdForUrl(url) {
  const target = String(url || '');
  if (!target) return null;
  for (const [id, attachment] of registry) {
    if (attachment.url === target) return id;
  }
  return null;
}

export function clearAttachments() {
  registry.clear();
}

// Markup for an attachment id, or null when unknown so the caller keeps the raw BBCode.
export function attachmentImage(attachment, sizeHint) {
  if (!attachment || attachment.isVideo || attachment.isAudio) return null;
  const src = attachment.url;
  const maxWidth = Number(sizeHint?.width) || attachment.width || 0;
  const maxHeight = Number(sizeHint?.height) || attachment.height || 0;
  return {
    src,
    alt: attachment.filename || `Tệp đính kèm ${attachment.id}`,
    width: maxWidth,
    height: maxHeight,
  };
}