// Independent BBCode codec. Unrecognised constructs stay lossless, atomic blocks.
import { getAttachment, attachmentImage } from './attachments.js';

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function safeEditorUrl(value) {
  const raw = String(value || '').trim();
  if (!/^https?:\/\//i.test(raw) || /[\u0000-\u0020\[\]"<>]/.test(raw)) return null;
  try { const url = new URL(raw); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function parseEditorCode(value) {
  const source = String(value || '');
  const root = { tag: 'root', children: [] };
  const stack = [root];
  const re = /\[(\/?)([a-z*]+)([^\]]*)\]/gi;
  let offset = 0, match;
  const text = (s) => { if (s) stack.at(-1).children.push(s); };
  while ((match = re.exec(source))) {
    text(source.slice(offset, match.index));
    offset = re.lastIndex;
    const tag = match[2].toLowerCase();
    if (match[1]) {
      const index = stack.findLastIndex((n) => n.tag === tag);
      if (index > 0) { stack[index].end = offset; stack.length = index; } else text(match[0]);
      continue;
    }
    if (tag === '*' && stack.at(-1).tag === '*') stack.pop();
    const node = { tag, arg: match[3].trim().replace(/^=\s*/, '').replace(/^("|')([\s\S]*)\1$/, '$2'), attrs: match[3], start: match.index, children: [] };
    stack.at(-1).children.push(node);
    if (tag === 'hr') { node.end = offset; continue; }
    if (['code', 'icode', 'php', 'html', 'plain'].includes(tag)) {
      const close = new RegExp(`\\[/${tag}\\]`, 'ig'); close.lastIndex = offset;
      const end = close.exec(source);
      if (end) { node.children.push(source.slice(offset, end.index)); node.end = offset = re.lastIndex = close.lastIndex; continue; }
    }
    stack.push(node);
  }
  text(source.slice(offset));
  function raw(node) {
    if (typeof node === 'string') return;
    node.raw = source.slice(node.start || 0, node.end ?? source.length);
    node.children.forEach(raw);
  }
  root.children.forEach(raw);
  return root;
}
export function editorCodePlain(value) {
  const plain = (node) => typeof node === 'string' ? node : node.children.map(plain).join('') + (['hr', '*', 'tr'].includes(node.tag) ? '\n' : '');
  return plain(parseEditorCode(value));
}
const inline = { b: 'strong', i: 'em', u: 'u', s: 's', color: 'span', size: 'span', font: 'span', url: 'a', icode: 'code', ispoiler: 'span', plain: 'span' };
const block = { left: 'div', center: 'div', right: 'div', justify: 'div', list: 'ul', '*': 'li', quote: 'blockquote', spoiler: 'section', code: 'pre', php: 'pre', html: 'pre', table: 'table', tr: 'tr', td: 'td', th: 'th' };
export function editorCodeHtml(value, preview = false) {
  function render(node) {
    if (typeof node === 'string') return escape(node).replace(/\n/g, '<br>');
    const { tag, arg, children } = node;
    const text = children.map((n) => typeof n === 'string' ? n : n.raw).join('');
    const data = ['b', 'i', 'u', 's'].includes(tag) && !node.attrs.trim() ? '' : ` data-bb-tag="${tag}" data-bb-attrs="${escape(node.attrs)}"`;
    if (tag === 'hr') return `<hr${data}>`;
    if (preview && ['embed', 'media'].includes(tag)) {
      let url = safeEditorUrl(text);
      if (tag === 'media') {
        if (arg === 'youtube' && /^[\w-]{11}$/.test(text)) url = `https://www.youtube.com/watch?v=${text}`;
        if (['twitter', 'x'].includes(arg) && /^\d+$/.test(text)) url = `https://x.com/i/status/${text}`;
        if (arg === 'tiktok' && /^\d+$/.test(text)) url = `https://www.tiktok.com/@_/video/${text}`;
        if (arg === 'reddit' && /^\w+\/comments\/[a-z0-9]+(?:\/[\w-]*)?$/i.test(text)) url = `https://www.reddit.com/r/${text}`;
        if (arg === 'imgur' && /^[\w-]{5,12}$/.test(text)) url = `https://imgur.com/${text}`;
      }
      if (url) return `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(url)}</a>`;
    }
    if (tag === 'img' && safeEditorUrl(text)) {
          // Images keep size/width so the editor shows the picture; they round-trip via data-bb-*.
          const size = /size\s*=\s*"?(\d+)(?:x(\d+))?"?/i.exec(node.attrs);
          const width = /width\s*=\s*"?(\d+)(?:px)?"?/i.exec(node.attrs);
          const height = /height\s*=\s*"?(\d+)(?:px)?"?/i.exec(node.attrs);
          let style = '';
          if (size) style = `width:${size[1]}px;height:${size[2] || size[1]}px;object-fit:contain`;
          else if (width || height) style = `${width ? `width:${width[1]}px;` : ''}${height ? `height:${height[1]}px;` : ''}`;
          return `<img${data} src="${escape(safeEditorUrl(text))}" alt="Ảnh" loading="lazy"${style ? ` style="${escape(style)}"` : ''}>`;
        }
        // [ATTACH] carries an id, not a URL: shown once the view registers the attachments.
        if (tag === 'attach') {
          const attachment = getAttachment(text.trim());
          const size = /size\s*=\s*"?(\d+)(?:x(\d+))?"?/i.exec(node.attrs);
          const image = attachmentImage(attachment, size ? { width: size[1], height: size[2] || size[1] } : null);
          if (image) {
            const style = image.width || image.height
              ? `${image.width ? `width:${image.width}px;` : ''}${image.height ? `height:${image.height}px;` : ''}object-fit:contain`
              : '';
            return `<img data-bb-tag="attach" data-bb-attrs="${escape(node.attrs)}" data-bb-attach-id="${escape(text.trim())}" src="${escape(image.src)}" alt="${escape(image.alt)}" loading="lazy"${style ? ` style="${escape(style)}"` : ''}>`;
          }
        }
    if (!(tag in inline) && !(tag in block) || tag === 'img') {
      return `<span class="editor-atomic" contenteditable="false" data-bb-raw="${escape(node.raw)}">${escape(node.raw)}</span>`;
    }
    let name = inline[tag] || block[tag], style = '', extra = '';
    if (tag === 'list' && arg) name = 'ol';
    if (tag === 'color' && /^(#[\da-f]{3,8}|[a-z]{1,24})$/i.test(arg)) style = `color:${arg}`;
    if (tag === 'font' && /^[\w -]{1,60}$/.test(arg)) style = `font-family:${arg}`;
    if (tag === 'size' && /^\d+(px)?$/.test(arg)) style = `font-size:${Math.min(48, Math.max(10, arg.endsWith('px') ? parseInt(arg) : 8 + Number(arg) * 2))}px`;
    if (['left', 'center', 'right', 'justify'].includes(tag)) style = `text-align:${tag}`;
    if (tag === 'url' && safeEditorUrl(arg || text)) extra = ` href="${escape(safeEditorUrl(arg || text))}" rel="noopener noreferrer" target="_blank"`;
    if (tag === 'ispoiler') extra = ' class="editor-inline-spoiler" tabindex="0" aria-label="Spoiler trong dòng"';
    if (tag === 'spoiler') extra = ` class="editor-spoiler" aria-label="${escape(arg || 'Spoiler')}"`;
    if (tag === 'quote') extra = ` aria-label="${escape(arg || 'Trích dẫn')}"`;
    const body = ['code', 'icode', 'php', 'html', 'plain'].includes(tag) ? escape(text) : children.map(render).join('');
    if (preview && tag === 'spoiler') return `<details><summary>${escape(arg || 'Spoiler')}</summary>${body}</details>`;
    return `<${name}${data}${style ? ` style="${escape(style)}"` : ''}${extra}>${body}</${name}>`;
  }
  return parseEditorCode(value).children.map(render).join('');
}
export function editorDomCode(root) {
  function serialize(node) {
    if (node.nodeType === 3) return node.nodeValue.replace(/\u00a0/g, ' ');
    if (node.nodeType !== 1) return '';
    if (node.hasAttribute('data-bb-raw')) return node.getAttribute('data-bb-raw');
    const name = node.tagName.toLowerCase();
    if (name === 'br') return '\n';
    // Live smilies are images; the BBCode is the original code.
    if (name === 'img' && node.dataset.smilie) return node.dataset.smilie;
    let body = [...node.childNodes].map(serialize).join('');
    let tag = node.dataset.bbTag, attrs = node.dataset.bbAttrs || '';
    if (tag === 'img') return `[IMG${attrs}]${safeEditorUrl(node.getAttribute('src')) || ''}[/IMG]`;
    // An attachment picture serializes back to its numeric id; the element only knows the URL.
    if (tag === 'attach') {
      const id = node.dataset.bbAttachId || attachmentIdForUrl(node.getAttribute('src'));
      if (id) return `[ATTACH${attrs}]${id}[/ATTACH]`;
    }
        // An <img> without data-bb-tag must still survive as BBCode.
        if (name === 'img') {
          const src = safeEditorUrl(node.getAttribute('src'));
          if (src) return `[IMG]${src}[/IMG]`;
        }
    if (tag === 'hr' || name === 'hr') return '[HR]';
    if (!tag) {
      tag = { strong: 'b', b: 'b', em: 'i', i: 'i', u: 'u', s: 's', strike: 's', blockquote: 'quote', pre: 'code', code: 'icode', ul: 'list', ol: 'list', li: '*', table: 'table', tr: 'tr', td: 'td', th: 'th' }[name];
      if (name === 'ol') attrs = '=1';
      if (name === 'a' && safeEditorUrl(node.getAttribute('href'))) { tag = 'url'; attrs = `=${safeEditorUrl(node.getAttribute('href'))}`; }
    }
    if (tag === '*') return `[*]${body}`;
    if (tag) return `[${tag.toUpperCase()}${attrs}]${body}[/${tag.toUpperCase()}]`;
    if (name === 'div' || name === 'p') {
      const previous = node.previousSibling;
      return `${previous && !(previous.nodeType === 1 && ['DIV', 'P'].includes(previous.tagName)) ? '\n' : ''}${body}${node.nextSibling ? '\n' : ''}`;
    }
    return body;
  }
  return [...root.childNodes].map(serialize).join('');
}
