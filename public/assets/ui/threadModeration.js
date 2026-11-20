// Thread moderation tools, mirroring voz's "More options" menu: edit title/prefix, lock, stick, delete, move.
// Every entry is gated on the flag the thread payload carries (`can_edit`, `can_lock_unlock`, …), so a normal
// member sees nothing beyond the watch button.

import { api } from '../api.js';
import { cachedCatalog } from '../lib/catalogs.js';
import { state } from '../core/dom.js';
import { esc } from '../core/utils.js';
import { openModal } from './modal.js';
import { toast } from './feedback.js';

const ACTIONS = [
  { key: 'edit', flag: 'can_edit', label: 'Sửa chủ đề' },
  { key: 'lock', flag: 'can_lock_unlock', label: null },
  { key: 'stick', flag: 'can_stick_unstick', label: null },
  { key: 'move', flag: 'can_move', label: 'Di chuyển chủ đề' },
  { key: 'delete', flag: 'can_soft_delete', label: 'Xoá chủ đề' },
];

export function canModerateThread(thread) {
  if (!state.loggedIn || !thread) return false;
  return ACTIONS.some((action) => thread[action.flag]);
}

export function moderationButtonHtml(thread) {
  if (!canModerateThread(thread)) return '';
  return `<button type="button" class="block-header-icon" id="mod-menu-btn" data-thread="${thread.thread_id}"
            title="Công cụ kiểm duyệt" aria-label="Công cụ kiểm duyệt" aria-haspopup="menu" aria-expanded="false">
            ${ICON_TOOLS}
          </button>`;
}

export function moderationMenuHtml(thread) {
  if (!canModerateThread(thread)) return '';
  const entries = ACTIONS.filter((action) => thread[action.flag]).map((action) => {
    const label = action.label || (action.key === 'lock'
      ? (thread.discussion_open ? 'Khoá chủ đề' : 'Mở khoá chủ đề')
      : (thread.sticky ? 'Bỏ ghim chủ đề' : 'Ghim chủ đề'));
    return `<button type="button" class="menu-linkRow" data-mod="${action.key}">${esc(label)}</button>`;
  });
  return `<div class="menu menu--structural block-header-menu" id="mod-menu" hidden role="menu">
      <div class="menu-content">
        ${entries.join('')}
      </div>
    </div>`;
}

export function wireModeration(thread, onChanged) {
  const toggle = document.getElementById('mod-menu-btn');
  const menu = document.getElementById('mod-menu');
  if (!toggle || !menu) return;

  const close = () => { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); };
  const open = () => { menu.hidden = false; toggle.setAttribute('aria-expanded', 'true'); };
  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    if (menu.hidden) open(); else close();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!menu.hidden && !event.target.closest('#mod-menu, #mod-menu-btn')) close();
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });

  menu.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-mod]');
    if (!button) return;
    close();
    const key = button.dataset.mod;
    try {
      if (key === 'lock') {
        const next = !thread.discussion_open;
        await api.updateThread(thread.thread_id, { discussion_open: next });
        thread.discussion_open = next;
        toast(next ? 'Đã khoá chủ đề' : 'Đã mở khoá chủ đề');
        onChanged?.();
      } else if (key === 'stick') {
        const next = !thread.sticky;
        await api.updateThread(thread.thread_id, { sticky: next });
        thread.sticky = next;
        toast(next ? 'Đã ghim chủ đề' : 'Đã bỏ ghim chủ đề');
        onChanged?.();
      } else if (key === 'edit') openEditDialog(thread, onChanged);
      else if (key === 'move') openMoveDialog(thread, onChanged);
      else if (key === 'delete') openDeleteDialog(thread, onChanged);
    } catch (error) {
      toast(error.message || 'Thao tác thất bại', true);
    }
  });
}

function openEditDialog(thread, onChanged) {
  const { close, root } = openModal(
    'Sửa chủ đề',
    `<form id="edit-thread-form">
       <div class="formRow">
         <label for="edit-thread-title">Tiêu đề</label>
         <input class="input" id="edit-thread-title" value="${esc(thread.title || '')}" maxlength="150" required>
       </div>
     </form>`,
    `<button class="button" type="button" data-cancel>Huỷ</button>
     <button class="button button--primary" type="submit" form="edit-thread-form">Lưu</button>`
  );
  root.querySelector('[data-cancel]').addEventListener('click', close);
  root.querySelector('#edit-thread-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = document.getElementById('edit-thread-title').value.trim();
    if (!title) return toast('Nhập tiêu đề', true);
    try {
      await api.updateThread(thread.thread_id, { title });
      thread.title = title;
      close();
      toast('Đã sửa chủ đề');
      onChanged?.();
    } catch (error) {
      toast(error.message || 'Sửa chủ đề thất bại', true);
    }
  });
}

async function openMoveDialog(thread, onChanged) {
  if (!state.nodes) {
    try {
      // Same response shape as the forum views ({ nodes, tree_map }): state.nodes holds the whole payload
      // everywhere, so the move dialog and the home view can never disagree about what state.nodes is.
      state.nodes = await cachedCatalog('nodes', () => api.nodes());
    } catch (error) {
      return toast(error.message || 'Không tải được danh sách diễn đàn', true);
    }
  }
  // Only real forums are valid targets; categories and link forums cannot hold threads.
  const forums = ((state.nodes || {}).nodes || [])
    .filter((node) => node.node_type_id === 'Forum' && Number(node.node_id) !== Number(thread.node_id))
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'vi'));
  const options = forums
    .map((node) => `<option value="${Number(node.node_id)}">${esc(node.title || '')}</option>`)
    .join('');
  const { close, root } = openModal(
    'Di chuyển chủ đề',
    `<form id="move-thread-form">
       <div class="formRow">
         <label for="move-thread-node">Diễn đàn đích</label>
         <select class="input" id="move-thread-node">${options}</select>
       </div>
       <label class="iconic"><input type="checkbox" id="move-thread-alert"><i aria-hidden="true"></i><span class="iconic-label">Gửi thông báo cho tác giả</span></label>
     </form>`,
    `<button class="button" type="button" data-cancel>Huỷ</button>
     <button class="button button--primary" type="submit" form="move-thread-form">Di chuyển</button>`
  );
  root.querySelector('[data-cancel]').addEventListener('click', close);
  root.querySelector('#move-thread-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const target = Number(document.getElementById('move-thread-node').value);
    const alert = document.getElementById('move-thread-alert').checked;
    if (!target) return toast('Chọn diễn đàn đích', true);
    try {
      await api.moveThread(thread.thread_id, target, alert);
      close();
      toast('Đã di chuyển chủ đề');
      onChanged?.();
    } catch (error) {
      toast(error.message || 'Di chuyển thất bại', true);
    }
  });
}

function openDeleteDialog(thread, onChanged) {
  const hardAvailable = !!thread.can_hard_delete;
  const { close, root } = openModal(
    'Xoá chủ đề',
    `<form id="delete-thread-form">
       <p>Chủ đề <strong>${esc(thread.title || '')}</strong> sẽ bị xoá.</p>
       <div class="formRow">
         <label class="iconic"><input type="checkbox" id="delete-thread-alert" checked><i aria-hidden="true"></i><span class="iconic-label">Gửi thông báo cho tác giả</span></label>
       </div>
       ${hardAvailable ? `<div class="formRow">
         <label class="iconic"><input type="checkbox" id="delete-thread-hard"><i aria-hidden="true"></i><span class="iconic-label">Xoá vĩnh viễn (không thể khôi phục)</span></label>
       </div>` : ''}
     </form>`,
    `<button class="button" type="button" data-cancel>Huỷ</button>
     <button class="button button--danger" type="submit" form="delete-thread-form">Xoá</button>`
  );
  root.querySelector('[data-cancel]').addEventListener('click', close);
  root.querySelector('#delete-thread-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = {};
    if (document.getElementById('delete-thread-alert').checked) query.starter_alert = true;
    const hard = document.getElementById('delete-thread-hard');
    if (hard?.checked) query.hard_delete = true;
    try {
      await api.deleteThread(thread.thread_id, query);
      close();
      toast('Đã xoá chủ đề');
      onChanged?.();
    } catch (error) {
      toast(error.message || 'Xoá chủ đề thất bại', true);
    }
  });
}

const ICON_TOOLS = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`;

// Warn dialog, opened from a post's action bar. Definitions come from `/voz/warnings`; the API takes one id.
export async function openWarnModal(postId, onDone) {
  let definitions = [];
  try {
    definitions = (await api.warnings()).warnings || [];
  } catch (error) {
    return toast(error.message || 'Không tải được danh sách cảnh cáo', true);
  }
  if (!definitions.length) return toast('Không có loại cảnh cáo nào', true);
  const options = definitions
    .map((d) => `<option value="${Number(d.warning_definition_id)}">${esc(d.title || '')}`
      + `${d.points != null ? ` — ${d.points} điểm` : ''}</option>`)
    .join('');
  const { close, root } = openModal(
    'Cảnh cáo bài viết',
    `<form id="warn-form">
       <div class="formRow">
         <label for="warn-definition">Loại cảnh cáo</label>
         <select class="input" id="warn-definition">${options}</select>
       </div>
     </form>`,
    `<button class="button" type="button" data-cancel>Huỷ</button>
     <button class="button button--danger" type="submit" form="warn-form">Cảnh cáo</button>`
  );
  root.querySelector('[data-cancel]').addEventListener('click', close);
  root.querySelector('#warn-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = Number(document.getElementById('warn-definition').value);
    if (!id) return toast('Chọn loại cảnh cáo', true);
    try {
      await api.warnPost(postId, id);
      close();
      toast('Đã cảnh cáo bài viết');
      onDone?.();
    } catch (error) {
      toast(error.message || 'Cảnh cáo thất bại', true);
    }
  });
}
