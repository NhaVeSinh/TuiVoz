/** Filter settings UI. */

import { esc } from '../core/utils.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/feedback.js';
import { ICON_DELETE, ICON_EDIT } from '../core/icons.js';
import {
  loadFilters, addFilter, updateFilter, removeFilter, moveFilter, setFilterEnabled,
} from './filters.js';
import {
  FIELD_DEFS, TEXT_MODES, OPERATORS, ACTIONS, ACTION_IDS, SCOPES, SCOPE_IDS,
  fieldsForScope, patternError, URL_MODES, urlRuleError,
} from './match.js';

// Suggested colours for "Nổi bật"; free input is still allowed.
const COLOR_PRESETS = ['#ff6600', '#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#e84393', '#95a5a6'];

// Accept #hex, bare hex, or any valid CSS colour.
function normalizeColor(value) {
  let color = String(value ?? '').trim();
  if (!color) return '';
  if (!color.startsWith('#') && /^[0-9a-fA-F]{3,8}$/.test(color)) color = `#${color}`;
  return CSS.supports('color', color) ? color : '';
}

const dragIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
const moveUpIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg>';
const moveDownIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 10 6 6 6-6"/></svg>';

// One-line summary of a condition for the list.
function conditionLabel(c) {
  const def = FIELD_DEFS[c.field];
  if (!def) return c.field;
  const ops = Object.fromEntries(OPERATORS[def.kind]);
  if (def.kind === 'text') {
    const mode = c.mode === 'regex' ? 'regex' : c.mode === 'wildcard' ? 'wildcard' : 'chứa';
    return `${def.label} · ${ops[c.op] || c.op} (${mode}) “${String(c.value ?? '').slice(0, 40)}”`;
  }
  return `${def.label} ${ops[c.op] || c.op} ${c.value}`;
}

function scopeLabel(filter) {
  return filter.scopes.map((s) => SCOPES[s]).join(' + ');
}

function filterSummary(filter) {
  const parts = filter.conditions.map((c, index) => {
    const text = conditionLabel(c);
    if (index === 0) return text;
    if (filter.join === 'custom') return `${c.or ? 'HOẶC' : 'VÀ'} ${text}`;
    return filter.join === 'any' ? `HOẶC ${text}` : `VÀ ${text}`;
  });
  return `${parts.join(' · ')}${parts.length ? ' — ' : ''}${ACTIONS[filter.action]?.label || filter.action}`;
}

export function filterRowsHtml() {
  const filters = loadFilters();
  if (!filters.length) {
    return '<li class="shortcut-empty">Chưa có bộ lọc nào. Thêm ở nút bên dưới.</li>';
  }
  return filters.map((filter, index) => `<li class="shortcut-row filter-row${filter.enabled === false ? ' is-disabled' : ''}" draggable="true" data-filter-id="${esc(filter.id)}" data-index="${index}">
    <span class="shortcut-handle" title="Kéo để đổi ưu tiên" aria-hidden="true">${dragIcon}</span>
    <span class="shortcut-index">${index + 1}</span>
    <span class="settings-reorder-controls">
      <button type="button" class="settings-reorder-button" data-move-filter="up" aria-label="Tăng ưu tiên"${index === 0 ? ' disabled' : ''}>${moveUpIcon}</button>
      <button type="button" class="settings-reorder-button" data-move-filter="down" aria-label="Giảm ưu tiên"${index === filters.length - 1 ? ' disabled' : ''}>${moveDownIcon}</button>
    </span>
    <span class="shortcut-main">
      <span class="shortcut-name">${esc(filter.name || 'Bộ lọc không tên')}${filter.action === 'highlight' ? ` <span class="filter-color-dot" style="background:${esc(filter.color)}"></span>` : ''}</span>
      <span class="shortcut-url"><span class="filter-scope-badge">${esc(scopeLabel(filter))}</span> · ${esc(filterSummary(filter))}</span>
    </span>
    <label class="filter-enabled" title="${filter.enabled === false ? 'Đang tắt' : 'Đang bật'}">
      <input type="checkbox" data-toggle-filter="${esc(filter.id)}"${filter.enabled === false ? '' : ' checked'}>
    </label>
    <button type="button" class="button button--small" data-edit-filter="${esc(filter.id)}" title="Sửa" aria-label="Sửa bộ lọc">${ICON_EDIT}</button>
    <button type="button" class="button button--small button--danger" data-delete-filter="${esc(filter.id)}" title="Xoá" aria-label="Xoá bộ lọc">${ICON_DELETE}</button>
  </li>`).join('');
}

// Filter editor modal

const newCondition = (scope = 'posts') => ({ field: fieldsForScope(scope)[0], op: 'eq', mode: 'contains', or: false, value: '' });

function conditionRowHtml(cond, index, scope = 'posts') {
  const allowed = fieldsForScope(scope);
  if (!allowed.includes(cond.field)) cond = { ...cond, ...newCondition(scope), or: cond.or, value: cond.value };
  const def = FIELD_DEFS[cond.field] || FIELD_DEFS[allowed[0]];
  const ops = OPERATORS[def.kind];
  const isPattern = def.kind === 'text';
  const placeholder = isPattern
    ? (cond.mode === 'regex' ? 'vd: /(quảng cáo|shopee)/i hoặc quảng cáo' : cond.mode === 'wildcard' ? 'vd: *shopee* hoặc shop??' : 'vd: từ khoá cần lọc')
    : def.kind === 'date' ? '' : 'vd: 100';
  const valueInput = def.kind === 'date'
    ? `<input class="input cond-value" type="date" value="${esc(cond.value)}">`
    : `<input class="input cond-value" type="text" ${def.kind === 'number' ? 'inputmode="decimal"' : ''} value="${esc(cond.value)}" placeholder="${placeholder}">`;
  return `<div class="filter-cond" data-index="${index}">
    ${index > 0 ? `<select class="input cond-joiner" aria-label="Toán tử nối với điều kiện trước">
        <option value="and"${cond.or ? '' : ' selected'}>VÀ</option>
        <option value="or"${cond.or ? ' selected' : ''}>HOẶC</option>
      </select>` : ''}
    <select class="input cond-field" aria-label="Trường dữ liệu">
      ${allowed.map((id) => `<option value="${id}"${cond.field === id ? ' selected' : ''}>${esc(FIELD_DEFS[id].label)}</option>`).join('')}
    </select>
    <select class="input cond-op" aria-label="Toán tử so sánh">
      ${ops.map(([id, label]) => `<option value="${id}"${cond.op === id ? ' selected' : ''}>${esc(label)}</option>`).join('')}
    </select>
    ${isPattern ? `<select class="input cond-mode" aria-label="Cách so khớp">
        ${TEXT_MODES.map(([id, label]) => `<option value="${id}"${cond.mode === id ? ' selected' : ''}>${esc(label)}</option>`).join('')}
      </select>` : ''}
    ${valueInput}
    <button type="button" class="button button--small button--danger cond-remove" title="Xoá điều kiện" aria-label="Xoá điều kiện">✕</button>
  </div>`;
}

// Custom-scope URL rule row; the per-row mode select avoids glob-char ambiguity.
function urlRowHtml(rule = { v: '', m: 'plain' }) {
  const mode = URL_MODES.some(([id]) => id === rule.m) ? rule.m : 'plain';
  const placeholder = mode === 'regex' ? 'vd: /\\/t\\/.*\\.\\d+\\//i' : mode === 'wildcard' ? '/t/ten-thread.12345/ hoặc /f/box.13/*' : '/t/ten-thread.12345/ hoặc tong-hop-addon';
  return `<div class="filter-url-row">
    <select class="input filter-url-mode" aria-label="Cách khớp URL">
      ${URL_MODES.map(([id, label]) => `<option value="${id}"${mode === id ? ' selected' : ''}>${esc(label)}</option>`).join('')}
    </select>
    <input class="input filter-url-input" type="text" value="${esc(rule.v || '')}" placeholder="${placeholder}" spellcheck="false" autocomplete="off">
    <button type="button" class="button button--small button--danger url-remove" title="Xoá URL" aria-label="Xoá URL">✕</button>
  </div>`;
}

function readCustomUrls(root) {
  return [...root.querySelectorAll('.filter-url-row')].map((row) => ({
    v: row.querySelector('.filter-url-input')?.value.trim() || '',
    m: row.querySelector('.filter-url-mode')?.value || 'plain',
  })).filter((rule) => rule.v);
}

// Snapshot condition rows from the DOM before a re-render.
function readConditions(root) {
  return [...root.querySelectorAll('.filter-cond')].map((row, index) => ({
    or: index > 0 ? row.querySelector('.cond-joiner')?.value === 'or' : false,
    field: row.querySelector('.cond-field')?.value || 'username',
    op: row.querySelector('.cond-op')?.value || 'eq',
    mode: row.querySelector('.cond-mode')?.value || 'contains',
    value: row.querySelector('.cond-value')?.value ?? '',
  }));
}

function renderConditions(root, conditions, scope = 'posts') {
  root.querySelector('#filter-conditions').innerHTML = conditions.map((c, i) => conditionRowHtml(c, i, scope)).join('');
}

// Per-row save-time validation message.
function conditionError(cond, scope) {
  const def = FIELD_DEFS[cond.field];
  if (!def || !fieldsForScope(scope).includes(cond.field)) return 'Chọn trường dữ liệu cho điều kiện.';
  if (def.kind === 'text') {
    const err = patternError(cond.mode || 'contains', cond.value);
    if (err) return `${def.label}: ${err}`;
    return '';
  }
  if (!String(cond.value ?? '').trim()) return `${def.label}: chưa nhập giá trị.`;
  if (def.kind === 'number' && !Number.isFinite(Number(cond.value))) return `${def.label}: giá trị phải là số.`;
  if (def.kind === 'date' && !Date.parse(`${cond.value}T00:00:00Z`)) return `${def.label}: ngày không hợp lệ.`;
  return '';
}

export function openFilterEditor(filter, onSaved) {
  const editing = !!filter;
  const draft = filter
    ? { ...filter, conditions: filter.conditions.map((c) => ({ ...c })) }
    : {
        enabled: true, name: '', scopes: ['posts'], action: 'hide',
        color: '#ff6600', join: 'custom', conditions: [newCondition()], customUrls: [],
      };

  const body = `
    <div class="formRow">
      <label for="filter-name">Tên bộ lọc</label>
      <input class="input" id="filter-name" maxlength="80" value="${esc(draft.name)}" placeholder="Ví dụ: Ẩn bài quảng cáo">
    </div>
    <div class="formRow">
      <label>Phạm vi tác dụng</label>
      <div class="filter-scope-picks">
        ${SCOPE_IDS.map((id) => `<label class="filter-pick"><input type="radio" name="filter-scope" value="${id}" data-scope="${id}"${draft.scopes[0] === id ? ' checked' : ''}> ${esc(SCOPES[id])}</label>`).join('')}
      </div>
      <div class="filter-custom-urls" id="filter-urls-wrap"${draft.scopes[0] === 'custom' ? '' : ' hidden'}>
        <p class="formHint">Mỗi dòng một mẫu: Đường dẫn = chứa chuỗi đó; Wildcard = <code>*</code>/<code>?</code> khớp cả đường dẫn; Regex = <code>/re/flags</code>. Paste link đầy đủ cũng được.</p>
        <div id="filter-urls"></div>
        <button type="button" class="button button--small" id="filter-add-url">+ Thêm URL</button>
      </div>
    </div>
    <div class="formRow">
      <label>Hành động</label>
      <div class="filter-action-picks">
        ${ACTION_IDS.map((id) => `<label class="filter-pick"><input type="radio" name="filter-action" value="${id}"${draft.action === id ? ' checked' : ''}> ${esc(ACTIONS[id].label)}</label>`).join('')}
      </div>
      <div class="filter-color-pick" id="filter-color-wrap"${draft.action === 'highlight' ? '' : ' hidden'}>
        <span class="filter-color-label">Màu viền</span>
        <span class="filter-swatches">
          ${COLOR_PRESETS.map((color) => `<button type="button" class="filter-swatch${draft.color === color ? ' is-active' : ''}" data-color="${color}" style="--swatch:${color}" aria-label="Chọn màu ${color}" title="${color}"></button>`).join('')}
        </span>
        <input class="input filter-color-input" id="filter-color" value="${esc(draft.color)}" placeholder="#ff6600" maxlength="40" spellcheck="false" autocomplete="off">
      </div>
      <p class="formHint">Ẩn: hiện một dòng mờ có lý do, chạm để xem nội dung. Xoá: gỡ hẳn khỏi trang. Nổi bật: viền quanh mục theo màu chọn.</p>
    </div>
    <div class="formRow">
      <label>Điều kiện lọc</label>
      <p class="formHint">Điều kiện được nối với điều kiện phía trên bằng hộp VÀ/HOẶC đầu mỗi dòng.</p>
      <div id="filter-conditions"></div>
      <button type="button" class="button button--small" id="filter-add-cond">+ Thêm điều kiện</button>
    </div>
    <div class="formRow">
      <label class="filter-pick"><input type="checkbox" id="filter-enabled"${draft.enabled ? ' checked' : ''}> Bật bộ lọc này</label>
    </div>
    <p class="formError" id="filter-error" hidden></p>`;

  const { close, root } = openModal(editing ? 'Sửa bộ lọc' : 'Thêm bộ lọc', body,
    '<button class="button" type="button" data-cancel>Huỷ</button>' +
    `<button class="button button--primary" type="button" data-save>${editing ? 'Lưu thay đổi' : 'Thêm bộ lọc'}</button>`,
    { className: 'filter-editor-modal' });

  const condsBox = root.querySelector('#filter-conditions');
  const errorEl = root.querySelector('#filter-error');
  let conditions = draft.conditions;
  let scope = draft.scopes[0] || 'posts';

  // Foreign-scope fields reset to the default; same-kind keeps op/mode.
  const normalizeForScope = (cond) => {
    if (fieldsForScope(scope).includes(cond.field)) return cond;
    const def = FIELD_DEFS[cond.field];
    const next = { ...cond, field: fieldsForScope(scope)[0] };
    if (FIELD_DEFS[next.field].kind !== def?.kind) {
      next.op = 'eq';
      next.mode = 'contains';
    }
    return next;
  };

  const rerenderConds = () => {
    renderConditions(root, conditions, scope);
  };
  conditions = conditions.map(normalizeForScope);
  rerenderConds();

  // Keep at least one empty URL row for easy input.
  const urlsBox = root.querySelector('#filter-urls');
  const urlsWrap = root.querySelector('#filter-urls-wrap');
  const readUrlsDom = () => [...urlsBox.querySelectorAll('.filter-url-row')].map((row) => ({
    v: row.querySelector('.filter-url-input')?.value ?? '',
    m: row.querySelector('.filter-url-mode')?.value || 'plain',
  }));
  const initialUrls = draft.customUrls?.length ? draft.customUrls : [{ v: '', m: 'plain' }];
  const renderUrls = (urls) => {
    urlsBox.innerHTML = (urls.length ? urls : [{ v: '', m: 'plain' }]).map(urlRowHtml).join('');
  };
  renderUrls(initialUrls);
  const syncUrlWrap = () => {
    urlsWrap.hidden = scope !== 'custom';
  };
  syncUrlWrap();

  urlsBox.addEventListener('click', (event) => {
    const remove = event.target.closest('.url-remove');
    if (!remove) return;
    remove.closest('.filter-url-row')?.remove();
    if (!urlsBox.querySelector('.filter-url-row')) renderUrls([]);
  });
  // Mode change re-renders rows but keeps typed values.
  urlsBox.addEventListener('change', (event) => {
    if (!event.target.closest('.filter-url-mode')) return;
    renderUrls(readUrlsDom());
  });
  root.querySelector('#filter-add-url').addEventListener('click', () => {
    urlsBox.insertAdjacentHTML('beforeend', urlRowHtml());
    urlsBox.lastElementChild?.querySelector('.filter-url-input')?.focus();
  });

  root.querySelector('.filter-scope-picks').addEventListener('change', (event) => {
    if (event.target.name !== 'filter-scope') return;
    scope = event.target.dataset.scope;
    conditions = readConditions(root).map(normalizeForScope);
    rerenderConds();
    syncUrlWrap();
  });

  root.querySelector('#filter-add-cond').addEventListener('click', () => {
    conditions = readConditions(root);
    conditions.push({ ...newCondition(scope), or: false });
    rerenderConds();
  });

  // Field/mode change rebuilds the rows, preserving entered values.
  condsBox.addEventListener('change', (event) => {
    if (!event.target.closest('.cond-field, .cond-mode')) return;
    conditions = readConditions(root);
    rerenderConds();
  });

  condsBox.addEventListener('click', (event) => {
    const remove = event.target.closest('.cond-remove');
    if (!remove) return;
    const index = Number(remove.closest('.filter-cond')?.dataset.index);
    conditions = readConditions(root);
    conditions.splice(index, 1);
    if (!conditions.length) conditions.push(newCondition(scope));
    rerenderConds();
  });

  root.querySelector('.filter-action-picks').addEventListener('change', (event) => {
    if (event.target.name !== 'filter-action') return;
    root.querySelector('#filter-color-wrap').hidden = event.target.value !== 'highlight';
  });

  const colorInput = root.querySelector('#filter-color');
  const syncSwatchState = (color) => {
    root.querySelectorAll('.filter-swatch').forEach((swatch) => {
      swatch.classList.toggle('is-active', swatch.dataset.color === color);
    });
  };
  root.querySelector('.filter-swatches').addEventListener('click', (event) => {
    const swatch = event.target.closest('.filter-swatch');
    if (!swatch) return;
    colorInput.value = swatch.dataset.color;
    colorInput.classList.remove('is-invalid');
    syncSwatchState(swatch.dataset.color);
  });
  colorInput.addEventListener('input', () => {
    const color = normalizeColor(colorInput.value);
    colorInput.classList.toggle('is-invalid', !color);
    syncSwatchState(color);
  });

  const showError = (message) => {
    errorEl.textContent = message;
    errorEl.hidden = !message;
  };

  root.querySelector('[data-cancel]').addEventListener('click', close);
  root.querySelector('[data-save]').addEventListener('click', () => {
    const scopes = [root.querySelector('[data-scope]:checked')?.dataset.scope || scope];
    const filled = readConditions(root).filter((c) => String(c.value ?? '').trim() !== '');
    if (!filled.length) return showError('Cần ít nhất một điều kiện có giá trị.');
    for (const cond of filled) {
      const err = conditionError(cond, scopes[0]);
      if (err) return showError(`Điều kiện ${filled.indexOf(cond) + 1}: ${err}`);
    }
    const action = root.querySelector('input[name="filter-action"]:checked')?.value || 'hide';
    const color = normalizeColor(colorInput.value);
    if (action === 'highlight' && !color) {
      colorInput.classList.add('is-invalid');
      return showError('Mã màu viền không hợp lệ — nhập mã hex (vd: #ff6600) hoặc chọn màu gợi ý.');
    }
    const customUrls = scopes[0] === 'custom' ? readCustomUrls(root) : [];
    if (scopes[0] === 'custom' && !customUrls.length) {
      return showError('Nhập ít nhất một URL áp dụng cho phạm vi Tự chọn.');
    }
    for (let i = 0; i < customUrls.length; i += 1) {
      const err = urlRuleError(customUrls[i]);
      if (err) return showError(`URL ${i + 1}: ${err}`);
    }
    const payload = {
      name: root.querySelector('#filter-name').value,
      enabled: root.querySelector('#filter-enabled').checked,
      scopes,
      action,
      color: color || '#ff6600',
      customUrls,
      join: 'custom',
      conditions: filled,
    };
    const result = editing ? updateFilter(filter.id, payload) : addFilter(payload);
    if (!result.ok) return showError(result.error);
    close();
    onSaved?.();
    toast(editing ? 'Đã cập nhật bộ lọc' : 'Đã thêm bộ lọc');
  });
}

// List wiring

export function wireFilterSettings() {
  const listEl = document.getElementById('filter-list');
  const countEl = document.getElementById('filter-count');
  if (!listEl) return;
  let draggedId = null;

  const rerender = () => {
    listEl.innerHTML = filterRowsHtml();
    if (countEl) countEl.textContent = `${loadFilters().length} bộ lọc`;
  };
  // Backup/restore redraws the list via this hook.
  window.__filterRerender = rerender;
  rerender();

  document.getElementById('filter-add').addEventListener('click', () => {
    openFilterEditor(null, rerender);
  });

  listEl.addEventListener('click', (event) => {
    const moveBtn = event.target.closest('[data-move-filter]');
    if (moveBtn) {
      const row = moveBtn.closest('.filter-row');
      const rows = [...listEl.querySelectorAll('.filter-row')];
      moveFilter(row.dataset.filterId, rows.indexOf(row) + (moveBtn.dataset.moveFilter === 'up' ? -1 : 1));
      rerender();
      return;
    }
    const editBtn = event.target.closest('[data-edit-filter]');
    if (editBtn) {
      const filter = loadFilters().find((item) => item.id === editBtn.dataset.editFilter);
      if (filter) openFilterEditor(filter, rerender);
      return;
    }
    const deleteBtn = event.target.closest('[data-delete-filter]');
    if (deleteBtn) {
      const filter = loadFilters().find((item) => item.id === deleteBtn.dataset.deleteFilter);
      if (!filter) return;
      if (!window.confirm(`Xoá bộ lọc "${filter.name || 'không tên'}"?`)) return;
      removeFilter(filter.id);
      rerender();
      toast('Đã xoá bộ lọc');
    }
  });

  listEl.addEventListener('change', (event) => {
    const toggle = event.target.closest('[data-toggle-filter]');
    if (!toggle) return;
    setFilterEnabled(toggle.dataset.toggleFilter, toggle.checked);
    toggle.closest('.filter-row')?.classList.toggle('is-disabled', !toggle.checked);
    toast(toggle.checked ? 'Đã bật bộ lọc' : 'Đã tắt bộ lọc');
  });

  // Drag reorder = priority (topmost wins).
  listEl.addEventListener('dragstart', (event) => {
    const row = event.target.closest('.filter-row');
    if (!row) return;
    draggedId = row.dataset.filterId;
    row.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedId);
  });
  listEl.addEventListener('dragend', () => {
    draggedId = null;
    for (const row of listEl.querySelectorAll('.filter-row')) row.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after');
  });
  listEl.addEventListener('dragover', (event) => {
    if (!draggedId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const row = event.target.closest('.filter-row');
    for (const item of listEl.querySelectorAll('.filter-row')) item.classList.remove('is-drop-before', 'is-drop-after');
    if (!row || row.dataset.filterId === draggedId) return;
    const rect = row.getBoundingClientRect();
    row.classList.add(event.clientY < rect.top + rect.height / 2 ? 'is-drop-before' : 'is-drop-after');
  });
  listEl.addEventListener('drop', (event) => {
    if (!draggedId) return;
    event.preventDefault();
    const row = event.target.closest('.filter-row');
    if (!row) return;
    const rows = [...listEl.querySelectorAll('.filter-row')];
    let targetIndex = rows.indexOf(row);
    const rect = row.getBoundingClientRect();
    if (event.clientY >= rect.top + rect.height / 2) targetIndex += 1;
    const fromIndex = rows.findIndex((item) => item.dataset.filterId === draggedId);
    if (fromIndex < targetIndex) targetIndex -= 1;
    moveFilter(draggedId, targetIndex);
    draggedId = null;
    rerender();
  });
}
