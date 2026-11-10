import { xf } from '../api.js';

let catalog;
let codes = new Map();
let pattern;

export function smilieChoices() { return [...new Set(codes.values())]; }

export async function loadSmilies() {
  if (!catalog) catalog = xf('/voz/smilies').then(({ smilies }) => {
    codes = new Map((smilies || []).flatMap((smilie) => (smilie.codes || []).map((code) => [code, smilie])));
    const escaped = [...codes.keys()].filter(Boolean).sort((a, b) => b.length - a.length).map((code) => code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    pattern = escaped.length ? new RegExp(escaped.join('|'), 'g') : null;
  }).catch(() => { catalog = null; });
  await catalog;
}

export const smiliesReady = () => Boolean(pattern);

// Shared tokenizer: the editor and the post body must agree on which codes are smilies.
export function splitSmilieText(text) {
  if (!pattern || !text) return [text];
  pattern.lastIndex = 0;
  const matches = [...text.matchAll(pattern)];
  if (!matches.length) return [text];
  const parts = [];
  let offset = 0;
  for (const match of matches) {
    const code = match[0];
    const smilie = codes.get(code);
    if (!smilie || !/^https:\/\/data\.voz\.vn\//.test(smilie.image_url)) continue;
    // Avoid turning fragments inside words or URLs into images.
    if (!code.startsWith(':') || !code.endsWith(':')) {
      if ((match.index && !/\s/.test(text[match.index - 1])) || (text[match.index + code.length] && !/\s|[.,!?]/.test(text[match.index + code.length]))) continue;
    }
    if (match.index > offset) parts.push(text.slice(offset, match.index));
    parts.push({ code, smilie });
    offset = match.index + code.length;
  }
  if (!offset) return [text];
  if (offset < text.length) parts.push(text.slice(offset));
  return parts;
}

export function renderSmilies(root) {
  if (!pattern) return false;
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    if (!walker.currentNode.parentElement.closest('a, code, pre, script, style')) nodes.push(walker.currentNode);
  }
  let replaced = false;
  for (const node of nodes) {
    const text = node.textContent;
    const parts = splitSmilieText(text);
    if (parts.length === 1 && typeof parts[0] === 'string') continue;
    const fragment = root.ownerDocument.createDocumentFragment();
    for (const part of parts) {
      if (typeof part === 'string') { fragment.append(part); continue; }
      const { smilie, code } = part;
      const image = root.ownerDocument.createElement('img');
      image.className = 'smilie';
      image.src = smilie.image_url;
      if (/^https:\/\/data\.voz\.vn\//.test(smilie.image_url_2x || '')) image.srcset = `${smilie.image_url} 1x, ${smilie.image_url_2x} 2x`;
      image.alt = code;
      image.title = `${smilie.title} ${code}`;
      // Editors need the source code back; an <img> cannot be serialized on its own.
      image.dataset.smilie = code;
      image.width = Number(smilie.width) || 24;
      image.height = Number(smilie.height) || 24;
      fragment.append(image);
    }
    node.replaceWith(fragment);
    replaced = true;
  }
  return replaced;
}
