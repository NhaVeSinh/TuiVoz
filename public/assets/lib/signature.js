// Signature BBCode → HTML. `post.message_parsed` is server HTML, but `User.signature` comes back as raw
// BBCode. Renders the small, safe subset signatures use; unknown tags stay escaped literal text.

import { parseEditorCode, safeEditorUrl } from './editorCodec.js';

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
// voz.vn signature colour names → hex. Unknown names are ignored.
const NAMED_COLORS = {
  red: '#ff0000', green: '#008000', blue: '#0000ff', orange: '#ff8c00', yellow: '#ffff00',
  purple: '#800080', pink: '#ffc0cb', brown: '#a52a2a', gray: '#808080', grey: '#808080',
  black: '#000000', white: '#ffffff', teal: '#008080', navy: '#000080', cyan: '#00ffff',
};

// XenForo's 1..7 font sizes; only the ones a signature realistically uses.
const SIZE_PX = { 1: '9px', 2: '10px', 3: '12px', 4: '15px', 5: '18px', 6: '22px', 7: '26px' };

// Inline tags whose content is emitted as-is.
const ATOMIC = new Set(['code', 'icode', 'php', 'html', 'plain']);

function safeColor(value) {
  const raw = String(value || '').trim();
  if (HEX.test(raw)) return raw.toLowerCase();
  return NAMED_COLORS[raw.toLowerCase()] || null;
}

function safeSize(value) {
  const raw = String(value || '').trim().replace(/px$/i, '');
  if (/^[1-7]$/.test(raw)) return SIZE_PX[raw];
  const px = Number(raw);
  return Number.isFinite(px) && px >= 8 && px <= 40 ? `${px}px` : null;
}

function safeFont(value) {
  // Only the fonts the app ships, so a signature cannot pull in an arbitrary family.
  const raw = String(value || '').trim().toLowerCase().replace(/['"]/g, '');
  if (raw.includes('be vietnam pro')) return "'Be Vietnam Pro', sans-serif";
  if (raw.includes('be vietnam')) return "'Be Vietnam', sans-serif";
  // Order matters: "sf pro display" must be tested before the generic `sf`/`pro` substrings.
  if (raw.includes('sf pro display') || raw.includes('sf-pro-display')) return "'SF Pro Display', sans-serif";
  // "Segoe UI" is vendored as "Segoe UI Local", but a signature naming it should still render, so point at the
  // OS family.
  if (raw.includes('segoe ui')) return "'Segoe UI', sans-serif";
  if (raw.includes('roboto')) return 'Roboto, sans-serif';
  return null;
}

function render(nodes, out) {
  for (const node of nodes) {
    if (typeof node === 'string') {
      out.push(escape(node).replace(/\n/g, '<br />'));
      continue;
    }
    const tag = node.tag;
    if (tag === '*') {
      out.push(`<li>${children(node)}</li>`);
      continue;
    }
    if (ATOMIC.has(tag)) {
      out.push(`<code>${escape(node.children.map((c) => (typeof c === 'string' ? c : c.raw || '')).join(''))}</code>`);
      continue;
    }
    const body = children(node);
    switch (tag) {
      case 'b': out.push(`<b>${body}</b>`); break;
      case 'i': out.push(`<i>${body}</i>`); break;
      case 'u': out.push(`<u>${body}</u>`); break;
      case 's': out.push(`<s>${body}</s>`); break;
      case 'hr': out.push('<hr />'); break;
      case 'br': out.push('<br />'); break;
      case 'left': out.push(`<div style="text-align:left">${body}</div>`); break;
      case 'center': out.push(`<div style="text-align:center">${body}</div>`); break;
      case 'right': out.push(`<div style="text-align:right">${body}</div>`); break;
      case 'list': out.push(`<ul>${body}</ul>`); break;
      case 'color': {
        const color = safeColor(node.arg);
        out.push(color ? `<span style="color:${color}">${body}</span>` : body);
        break;
      }
      case 'size': {
        const size = safeSize(node.arg);
        out.push(size ? `<span style="font-size:${size}">${body}</span>` : body);
        break;
      }
      case 'font': {
        const font = safeFont(node.arg);
        out.push(font ? `<span style="font-family:${font}">${body}</span>` : body);
        break;
      }
      case 'url': {
        // [URL]https://x[/URL] — arg empty, href is the text. [URL='x']label[/URL] — arg is href.
        const text = node.children.map((c) => (typeof c === 'string' ? c : c.raw || '')).join('');
        const href = safeEditorUrl(node.arg || text.trim());
        out.push(href ? `<a href="${escape(href)}">${node.arg ? body : escape(href)}</a>` : body);
        break;
      }
      case 'img': {
        const src = safeEditorUrl(node.children.map((c) => (typeof c === 'string' ? c : '')).join('').trim());
        out.push(src ? `<img src="${escape(src)}" alt="" />` : '');
        break;
      }
      case 'quote':
      case 'spoiler':
        // Not meaningful in a signature; keep the text, drop the wrapper.
        out.push(body);
        break;
      default:
        // Unknown tag: show it literally.
        out.push(escape(node.raw || '') + body);
    }
  }
  return out.join('');
}

function children(node) {
  return render(node.children || [], []);
}

// HTML safe to hand to sanitizeHtml(). Empty input yields ''.
export function signatureHtml(bbcode) {
  const source = String(bbcode || '').trim();
  if (!source) return '';
  return render(parseEditorCode(source).children, []);
}
