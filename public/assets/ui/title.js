// Page titles, mirroring voz.vn's own composition: "<name> | VOZ", with "| Page N" between the name and the
// brand on any page after the first. Page 1 never gets the suffix.

const BRAND = 'VOZ';

// Single writer for document.title, so a route change never leaves a stale title.
export function setTitle(name, page) {
  const label = String(name == null ? '' : name).trim();
  const n = Number(page) || 1;
  const parts = [];
  if (label) parts.push(label);
  if (n > 1) parts.push(`Page ${n}`);
  parts.push(BRAND);
  document.title = parts.join(' | ');
}

// The home and login pages carry the bare brand, with no page segment.
export function setBrandTitle() {
  document.title = BRAND;
}

// Thread titles put the prefix after the title, joined with a hyphen — the opposite order from the on-page
// heading, which shows the label first.
export function setThreadTitle(thread, page) {
  const title = String(thread?.title || '').trim();
  const prefix = String(thread?.prefix || '').trim();
  const name = prefix ? `${title} - ${prefix}` : title;
  setTitle(name, page);
}
