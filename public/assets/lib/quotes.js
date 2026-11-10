// Long quotes would push the rest of the thread off screen. voz.vn clips any quote whose content passes 800px
// and fades it into a "Click to expand..." button.
export const MAX_QUOTE_HEIGHT = 800;

function expandableQuote(quote) {
  // The threshold is on the content, not the blockquote, so a barely-over quote gains no button that reveals
  // two pixels.
  const content = quote.scrollHeight;
  if (content <= MAX_QUOTE_HEIGHT) return;
  // The header stays outside the clip so the reader always sees whose post is quoted.
  const head = quote.querySelector('.quote-source');
  const body = quote.ownerDocument.createElement('div');
  body.className = 'quote-expand-content';
  let node = head ? head.nextSibling : quote.firstChild;
  while (node) {
    const next = node.nextSibling;
    body.append(node);
    node = next;
  }
  if (!body.childNodes.length) return;

  const link = quote.ownerDocument.createElement('button');
  link.type = 'button';
  link.className = 'quote-expand-link';
  link.setAttribute('aria-expanded', 'false');
  const label = quote.ownerDocument.createElement('span');
  label.textContent = 'Bấm để mở rộng...';
  link.append(label);
  link.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const expanded = quote.classList.toggle('is-expanded');
    link.setAttribute('aria-expanded', String(expanded));
    label.textContent = expanded ? 'Thu gọn' : 'Bấm để mở rộng...';
  });

  quote.append(body, link);
  quote.classList.add('is-expandable');
}

export function wireQuoteExpansion(root = document) {
  for (const quote of root.querySelectorAll('blockquote.xfBb-quote:not(.is-expandable)')) {
    expandableQuote(quote);
  }
}

let scheduled = false;

// Quotes can only be measured once laid out, so this runs on an animation frame.
function scheduleQuoteExpansion() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    wireQuoteExpansion();
  });
}

export function wireAllQuoteExpansion() {
  scheduleQuoteExpansion();
  // Watch the whole body: views replace #app and appended pages arrive later.
  new MutationObserver(scheduleQuoteExpansion).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', scheduleQuoteExpansion);
  // A quote holding a picture measures short until it decodes, so re-measure on image load.
  document.addEventListener('load', (event) => {
    if (event.target instanceof HTMLImageElement && event.target.closest('blockquote.xfBb-quote')) scheduleQuoteExpansion();
  }, true);
}

export function restoreQuoteLinks(root, bbcode) {
  const source = String(bbcode || '').replace(/\[(code|php|html)(?:=[^\]]*)?\][\s\S]*?\[\/\1\]/gi, '');
  const quotes = [...source.matchAll(/\[quote(?:=([^\]]*))?\]/gi)].map((match) => {
    const value = (match[1] || '').replace(/^['"]|['"]$/g, '');
    const post = value.match(/,\s*post:\s*(\d+)/i);
    return { name: value.split(/,\s*(?:post|member):/i)[0], id: post?.[1] };
  });
  let index = 0;
  for (const quote of root.querySelectorAll('blockquote.xfBb-quote')) {
    const meta = quotes[index++];
    if (!meta?.id || meta.name !== quote.getAttribute('data-name')) continue;
    const link = root.ownerDocument.createElement('a');
    link.className = 'quote-source';
    link.href = `/p/${meta.id}/`;
    link.textContent = `${meta.name} đã viết: ↑`;
    quote.prepend(link);
    quote.classList.add('has-quote-source');
  }
}
