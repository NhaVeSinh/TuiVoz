// Implements the `data-onerror` contract in voz.vn's server HTML: XenForo binds it in JS we never load, so a
// dead favicon would keep its alt text. `error` does not bubble.

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
