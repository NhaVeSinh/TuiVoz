/** Spoilers. */

function argument(value) {
  return value.trim().replace(/^=\s*/, '').replace(/^(["'])([\s\S]*)\1$/, '$2');
}

function safeUrl(value) {
  try {
    const url = new URL(value, 'https://voz.vn');
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function parseBbcode(source) {
  const root = { tag: 'root', children: [] };
  const stack = [root];
  const tokens = /\[(\/?)([a-z*]+)([^\]]*)\]/gi;
  let last = 0;
  let match;
  const text = (value) => { if (value) stack.at(-1).children.push(value); };
  while ((match = tokens.exec(source))) {
    text(source.slice(last, match.index));
    last = tokens.lastIndex;
    const tag = match[2].toLowerCase();
    if (match[1]) {
      const index = stack.findLastIndex((node) => node.tag === tag);
      if (index > 0) stack.length = index;
      else text(match[0]);
      continue;
    }
    if (['code', 'icode', 'php', 'html'].includes(tag)) {
      const end = new RegExp(`\\[/${tag}\\]`, 'ig');
      end.lastIndex = last;
      const close = end.exec(source);
      if (close) {
        stack.at(-1).children.push({ tag, arg: '', children: [source.slice(last, close.index)] });
        last = tokens.lastIndex = end.lastIndex;
        continue;
      }
    }
    if (tag === '*') {
      if (stack.at(-1).tag === '*') stack.pop();
    }
    const node = { tag, arg: argument(match[3]), children: [] };
    stack.at(-1).children.push(node);
    stack.push(node);
  }
  text(source.slice(last));
  return root;
}

function plain(node) {
  return typeof node === 'string' ? node : node.children.map(plain).join('');
}

function render(node, doc) {
  if (typeof node === 'string') {
    const fragment = doc.createDocumentFragment();
    node.split('\n').forEach((line, index) => {
      if (index) fragment.append(doc.createElement('br'));
      fragment.append(doc.createTextNode(line));
    });
    return fragment;
  }
  const tags = { b: 'b', i: 'i', u: 'u', s: 's', list: 'ul', '*': 'li', quote: 'blockquote', code: 'pre', php: 'pre', html: 'pre', icode: 'code', url: 'a', user: 'a' };
  const el = doc.createElement(node.tag === 'spoiler' ? 'details' : tags[node.tag] || 'span');
  if (node.tag === 'spoiler') {
    el.className = 'post-spoiler';
    const summary = doc.createElement('summary');
    summary.textContent = node.arg || 'Spoiler';
    el.append(summary);
  }
  if (node.tag === 'url' || node.tag === 'user') {
    const url = node.tag === 'user' && /^\d+$/.test(node.arg) ? `/u/${node.arg}/` : safeUrl(node.arg || plain(node));
    if (url) el.setAttribute('href', url);
  }
  if (node.tag === 'img') {
    const url = safeUrl(plain(node));
    if (url) { const img = doc.createElement('img'); img.src = url; img.alt = ''; el.append(img); return el; }
  }
  if (node.tag === 'attach' && /^\d+$/.test(plain(node).trim())) {
    const img = doc.createElement('img');
    img.src = `/forum/attachments/${plain(node).trim()}/`;
    img.alt = 'Ảnh đính kèm';
    el.append(img);
    return el;
  }
  if (node.tag === 'embed') {
    const url = safeUrl(plain(node).trim());
    if (url) {
      const link = doc.createElement('a');
      link.href = url;
      link.textContent = url;
      el.append(link);
      return el;
    }
  }
  if (node.tag === 'media') {
    el.dataset.mediaSiteId = node.arg;
    el.dataset.mediaKey = plain(node).trim();
  }
  if (node.tag === 'quote') {
    el.className = 'xfBb-quote';
    el.dataset.name = node.arg.split(/,\s*(?:post|member):/i)[0];
  }
  if (node.tag === 'color' && /^(?:#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/i.test(node.arg)) el.style.color = node.arg;
  if (node.tag === 'size' && /^\d+(?:px)?$/.test(node.arg)) {
    const size = parseInt(node.arg, 10);
    el.style.fontSize = `${Math.min(36, Math.max(10, node.arg.endsWith('px') ? size : 8 + size * 2))}px`;
  }
  if (['center', 'left', 'right'].includes(node.tag)) { el.style.display = 'block'; el.style.textAlign = node.tag; }
  for (const child of node.children) el.append(render(child, doc));
  return el;
}

export function restoreSpoilers(root, bbcode) {
  if (!/\[spoiler[=\]]/i.test(bbcode || '')) return;
  const tree = parseBbcode(bbcode);
  const spoilers = [];
  function collect(node) {
    if (typeof node === 'string') return;
    if (node.tag === 'spoiler') spoilers.push(node);
    else for (const child of node.children) collect(child);
  }
  collect(tree);
  const placeholders = [...root.querySelectorAll('div')].filter((el) => !el.children.length && el.textContent.trim() === 'Spoiler content hidden.');
  if (placeholders.length !== spoilers.length) return;
  placeholders.forEach((el, index) => el.replaceWith(render(spoilers[index], root.ownerDocument)));
}
