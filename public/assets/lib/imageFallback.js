/** Broken-image fallback. */

const BOUND = Symbol('vozImageFallbacks');

function handleError(event) {
  const img = event.target;
  if (!img || img.tagName !== 'IMG') return;
  const action = img.getAttribute('data-onerror');
  if (action === 'hide-parent') {
    if (img.parentElement) img.parentElement.hidden = true;
  } else if (action === 'hide') {
    img.hidden = true;
  }
}

export function wireImageFallbacks(doc = document) {
  if (doc[BOUND]) return;
  doc[BOUND] = true;
  doc.addEventListener('error', handleError, true);
}
