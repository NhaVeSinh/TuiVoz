// @mention autocomplete for the reply editor, mirroring voz.vn's `ul.autoCompleteList`: an avatar plus the
// member name with the typed prefix in bold, three suggestions at a time.

import { api } from '../api.js';
import { avatarMarkup } from '../lib/avatar.js';

const LIMIT = 3;
const DELAY = 250;

// A mention is typed at the start of a word; the app posts BBCode, so only the plain `@name` is stored.
export function mentionContext(text, caret) {
  const upto = String(text || '').slice(0, caret);
  const match = /(^|[\s([{>])@([\p{L}\p{N}_.'\-]{1,50})$/u.exec(upto);
  if (!match) return null;
  return { start: caret - match[2].length - 1, end: caret, query: match[2] };
}

function highlight(username, query) {
  const name = String(username || '');
  const lower = name.toLowerCase();
  const needle = query.toLowerCase();
  let at = lower.startsWith(needle) ? 0 : lower.indexOf(needle);
  if (at < 0) return document.createTextNode(name);
  const fragment = document.createDocumentFragment();
  if (at) fragment.append(name.slice(0, at));
  const strong = document.createElement('strong');
  strong.textContent = name.slice(at, at + query.length);
  fragment.append(strong, name.slice(at + query.length));
  return fragment;
}

// `commit(username)` moves the caret; `list` lives inside the editor so `positionEditor` already ran.
export function openMentionMenu({ ed, list, commit }) {
  let items = [];
  let active = 0;
  let query = '';
  let anchor = null;
  let timer = 0;
  let seq = 0;

  const close = () => {
    clearTimeout(timer);
    seq += 1;
    items = [];
    active = 0;
    query = '';
    anchor = null;
    list.hidden = true;
    list.replaceChildren();
    ed.removeAttribute('aria-activedescendant');
  };

  const paint = () => {
    list.replaceChildren(
      ...items.map((user, index) => {
        const li = document.createElement('li');
        li.id = `mention-option-${user.user_id}`;
        li.setAttribute('role', 'option');
        li.dataset.userId = String(user.user_id);
        li.dataset.username = user.username;
        li.classList.toggle('is-selected', index === active);
        li.setAttribute('aria-selected', String(index === active));
        const icon = document.createElement('span');
        icon.className = 'mention-icon';
        icon.innerHTML = avatarMarkup(user, 'xxs');
        const name = document.createElement('span');
        name.className = 'mention-name';
        name.append(highlight(user.username, query));
        li.append(icon, name);
        return li;
      })
    );
    list.hidden = !items.length;
    if (items.length) ed.setAttribute('aria-activedescendant', list.children[active].id);
    else ed.removeAttribute('aria-activedescendant');
  };

  // voz.vn opens the list under the caret, keeping it inside the window on both axes.
  const place = () => {
    const range = anchor;
    if (!range || list.hidden) return;
    const rect = range.getBoundingClientRect();
    const width = list.offsetWidth || 180;
    const height = list.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const left = rect.left || ed.getBoundingClientRect().left + 6;
    list.style.left = `${Math.max(0, Math.min(left, vw - width - 8))}px`;
    list.style.top = `${rect.bottom + 2 + height > vh ? Math.max(0, rect.top - height - 2) : rect.bottom + 2}px`;
  };

  const load = () => {
    const token = ++seq;
    api.findUser(query)
      .then((data) => {
        if (token !== seq) return;
        items = (data?.recommendations || []).slice(0, LIMIT);
        active = 0;
        paint();
        place();
      })
      .catch(() => close());
  };

  const move = (step) => {
    if (!items.length) return false;
    active = (active + step + items.length) % items.length;
    paint();
    place();
    list.children[active]?.scrollIntoView({ block: 'nearest' });
    return true;
  };

  const choose = (index = active) => {
    const user = items[index];
    if (!user) return false;
    commit(user.username);
    close();
    return true;
  };

  return {
    // Called after every change to the visual editor: re-reads the caret and re-queries on a new prefix.
    update() {
      const selection = document.getSelection();
      if (!selection?.rangeCount) return close();
      const range = selection.getRangeAt(0);
      const node = range.startContainer;
      if (range.collapsed && (node.nodeType === 3 || node === ed) && ed.contains(node)) {
        const ctx = mentionContext(node.nodeType === 3 ? node.nodeValue : '', range.startOffset);
        if (ctx) {
          anchor = range.cloneRange();
          if (ctx.query === query && items.length) {
            place();
            return;
          }
          query = ctx.query;
          clearTimeout(timer);
          timer = setTimeout(load, DELAY);
          return;
        }
      }
      close();
    },
    // Returns true when the key belonged to the menu, so the editor must not also handle it.
    key(event) {
      if (list.hidden || !items.length) return false;
      if (event.key === 'ArrowDown') { event.preventDefault(); move(1); return true; }
      if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); return true; }
      if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); choose(); return true; }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return true; }
      return false;
    },
    choose,
    close,
    place,
    isOpen: () => !list.hidden,
  };
}
