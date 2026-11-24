/** document.title. */

const BRAND = 'VOZ';

// Single writer for document.title, so routes never leave a stale one.
export function setTitle(name, page) {
  const label = String(name == null ? '' : name).trim();
  const n = Number(page) || 1;
  const parts = [];
  if (label) parts.push(label);
  if (n > 1) parts.push(`Page ${n}`);
  parts.push(BRAND);
  document.title = parts.join(' | ');
}

// Home and login show the bare brand.
export function setBrandTitle() {
  document.title = BRAND;
}

// Prefix goes after the title here — reversed vs the on-page heading.
export function setThreadTitle(thread, page) {
  const title = String(thread?.title || '').trim();
  const prefix = String(thread?.prefix || '').trim();
  const name = prefix ? `${title} - ${prefix}` : title;
  setTitle(name, page);
}
